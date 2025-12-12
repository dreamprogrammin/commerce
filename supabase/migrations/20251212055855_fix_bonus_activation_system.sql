-- =====================================================================================
-- Миграция: Исправление системы активации бонусов
-- Файл: fix_bonus_activation_system.sql
-- Дата: 2025-12-12
-- Описание: Исправляет логику функции activate_pending_bonuses и пересчитывает балансы
-- =====================================================================================

-- =====================================================================================
-- Шаг 1: Обновление функции activate_pending_bonuses
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    order_row RECORD;
    total_activated INT := 0;
    processed_orders INT := 0;
    welcome_bonus_users INT := 0;
BEGIN
    -- Часть 1: Активируем приветственные бонусы (через 14 дней с регистрации)
    WITH updated_profiles AS (
        UPDATE public.profiles
        SET 
            active_bonus_balance = active_bonus_balance + pending_bonus_balance,
            pending_bonus_balance = 0
        WHERE 
            has_received_welcome_bonus = TRUE 
            AND pending_bonus_balance > 0
            AND created_at < NOW() - INTERVAL '14 days'
        RETURNING id
    )
    SELECT COUNT(*) INTO welcome_bonus_users FROM updated_profiles;

    -- Часть 2: Активируем бонусы за подтверждённые заказы
    FOR order_row IN
        SELECT 
            o.id, 
            o.user_id, 
            o.bonuses_awarded,
            p.pending_bonus_balance as current_pending
        FROM public.orders o
        JOIN public.profiles p ON p.id = o.user_id
        WHERE 
            o.status = 'confirmed' 
            AND o.bonuses_activation_date IS NOT NULL 
            AND o.bonuses_activation_date <= NOW()
            AND o.user_id IS NOT NULL
            -- ✅ Проверяем, что у пользователя достаточно pending бонусов
            AND p.pending_bonus_balance >= o.bonuses_awarded
        ORDER BY o.bonuses_activation_date ASC
        FOR UPDATE OF o SKIP LOCKED
    LOOP
        BEGIN
            -- Перемещаем бонусы из pending в active
            UPDATE public.profiles
            SET 
                pending_bonus_balance = pending_bonus_balance - order_row.bonuses_awarded,
                active_bonus_balance = active_bonus_balance + order_row.bonuses_awarded
            WHERE id = order_row.user_id;

            -- Помечаем заказ как завершённый
            UPDATE public.orders 
            SET status = 'completed' 
            WHERE id = order_row.id;

            total_activated := total_activated + order_row.bonuses_awarded;
            processed_orders := processed_orders + 1;
            
        EXCEPTION WHEN OTHERS THEN
            -- Логируем ошибку, но продолжаем обработку других заказов
            RAISE WARNING 'Ошибка при активации бонусов для заказа %: %', 
                order_row.id, 
                SQLERRM;
        END;
    END LOOP;

    RETURN format(
        'Приветственные бонусы: %s пользователей. Заказы: %s обработано, %s бонусов активировано.',
        welcome_bonus_users,
        processed_orders,
        total_activated
    );
END;
$$;

COMMENT ON FUNCTION public.activate_pending_bonuses IS 
'Активирует ожидающие бонусы: приветственные (через 14 дней с регистрации) и за заказы (через 14 дней с подтверждения). Запускается через pg_cron ежедневно.';

-- =====================================================================================
-- Шаг 2: Функция для пересчёта некорректных балансов
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.recalculate_pending_balances()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    user_record RECORD;
    fixed_count INT := 0;
    errors_count INT := 0;
BEGIN
    FOR user_record IN 
        SELECT 
            p.id,
            p.pending_bonus_balance as current_pending,
            p.has_received_welcome_bonus,
            p.created_at
        FROM public.profiles p
        WHERE p.pending_bonus_balance < 0
    LOOP
        BEGIN
            DECLARE
                correct_balance INT := 0;
                welcome_bonus INT := 0;
                orders_bonus INT := 0;
            BEGIN
                -- Считаем бонусы за неактивированные заказы
                SELECT COALESCE(SUM(bonuses_awarded), 0)
                INTO orders_bonus
                FROM public.orders
                WHERE 
                    user_id = user_record.id
                    AND status = 'confirmed'
                    AND bonuses_activation_date IS NOT NULL
                    AND bonuses_activation_date > NOW();

                -- Проверяем приветственный бонус
                IF user_record.has_received_welcome_bonus = TRUE 
                   AND user_record.created_at > NOW() - INTERVAL '14 days' THEN
                    welcome_bonus := 1000;
                END IF;

                correct_balance := orders_bonus + welcome_bonus;

                -- Исправляем баланс
                UPDATE public.profiles
                SET pending_bonus_balance = correct_balance
                WHERE id = user_record.id;

                fixed_count := fixed_count + 1;
            END;
        EXCEPTION WHEN OTHERS THEN
            errors_count := errors_count + 1;
            RAISE WARNING 'Ошибка при исправлении баланса пользователя %: %', 
                user_record.id, 
                SQLERRM;
        END;
    END LOOP;

    RETURN format('Исправлено: %s пользователей. Ошибок: %s', fixed_count, errors_count);
END;
$$;

COMMENT ON FUNCTION public.recalculate_pending_balances IS 
'Пересчитывает pending_bonus_balance для пользователей с отрицательным балансом.';

-- =====================================================================================
-- Шаг 3: Исправление существующих данных
-- =====================================================================================

-- Запускаем пересчёт балансов
SELECT public.recalculate_pending_balances();

-- =====================================================================================
-- Шаг 4: Проверка и обновление constraints
-- =====================================================================================

-- Удаляем и пересоздаём constraint для pending_bonus_balance
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_pending_bonus_balance_check' 
        AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_pending_bonus_balance_check;
    END IF;
    
    ALTER TABLE public.profiles 
    ADD CONSTRAINT profiles_pending_bonus_balance_check 
    CHECK (pending_bonus_balance >= 0);
END $$;

-- Аналогично для active_bonus_balance
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'profiles_active_bonus_balance_check' 
        AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles DROP CONSTRAINT profiles_active_bonus_balance_check;
    END IF;
    
    ALTER TABLE public.profiles 
    ADD CONSTRAINT profiles_active_bonus_balance_check 
    CHECK (active_bonus_balance >= 0);
END $$;

-- =====================================================================================
-- Шаг 5: Создание индексов для оптимизации
-- =====================================================================================

-- Индекс для быстрого поиска заказов, готовых к активации
CREATE INDEX IF NOT EXISTS idx_orders_bonus_activation 
ON public.orders (bonuses_activation_date, status, user_id)
WHERE bonuses_activation_date IS NOT NULL AND status = 'confirmed';

-- Индекс для быстрого поиска пользователей с приветственным бонусом
CREATE INDEX IF NOT EXISTS idx_profiles_welcome_bonus_activation
ON public.profiles (created_at, has_received_welcome_bonus, pending_bonus_balance)
WHERE has_received_welcome_bonus = TRUE AND pending_bonus_balance > 0;

-- =====================================================================================
-- Шаг 6: View для мониторинга бонусной системы
-- =====================================================================================

CREATE OR REPLACE VIEW public.bonus_system_status AS
SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance > 0) as users_with_pending_bonuses,
    (SELECT COUNT(*) FROM public.profiles WHERE active_bonus_balance > 0) as users_with_active_bonuses,
    (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance < 0 OR active_bonus_balance < 0) as users_with_negative_balance,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'confirmed' AND bonuses_activation_date <= NOW()) as orders_ready_for_activation,
    (SELECT COALESCE(SUM(bonuses_awarded), 0) FROM public.orders WHERE status = 'confirmed' AND bonuses_activation_date <= NOW()) as bonuses_ready_for_activation,
    (SELECT MAX(start_time) FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid = jrd.jobid WHERE j.jobname = 'Daily Bonus Activation') as last_cron_run,
    (SELECT status FROM cron.job_run_details jrd JOIN cron.job j ON j.jobid = jrd.jobid WHERE j.jobname = 'Daily Bonus Activation' ORDER BY start_time DESC LIMIT 1) as last_cron_status;

COMMENT ON VIEW public.bonus_system_status IS 
'Мониторинг состояния бонусной системы';

-- =====================================================================================
-- Шаг 7: Тестовый запуск функции
-- =====================================================================================

-- Запускаем функцию активации для проверки
SELECT public.activate_pending_bonuses();

-- =====================================================================================
-- Конец миграции
-- =====================================================================================