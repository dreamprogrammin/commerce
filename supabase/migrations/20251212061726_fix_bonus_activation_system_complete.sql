-- =====================================================================================
-- Миграция: Исправление системы активации бонусов (ПОЛНАЯ ВЕРСИЯ)
-- Файл: 20251212_fix_bonus_activation_complete.sql
-- Дата: 2025-12-12
-- Описание: Исправляет логику функции activate_pending_bonuses и пересчитывает балансы
-- =====================================================================================

-- =====================================================================================
-- Шаг 0: Создание таблицы для логирования пропущенных активаций
-- =====================================================================================

CREATE TABLE IF NOT EXISTS public.bonus_activation_skipped (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID,
    user_id UUID,
    reason TEXT NOT NULL,
    bonuses_amount INT,
    pending_balance INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.bonus_activation_skipped IS 
'Лог пропущенных активаций бонусов для диагностики проблем';

CREATE INDEX IF NOT EXISTS idx_bonus_activation_skipped_created 
ON public.bonus_activation_skipped(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bonus_activation_skipped_user 
ON public.bonus_activation_skipped(user_id);

CREATE INDEX IF NOT EXISTS idx_bonus_activation_skipped_order 
ON public.bonus_activation_skipped(order_id);

-- Добавляем foreign keys, если их еще нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'bonus_activation_skipped_order_id_fkey'
    ) THEN
        ALTER TABLE public.bonus_activation_skipped 
        ADD CONSTRAINT bonus_activation_skipped_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'bonus_activation_skipped_user_id_fkey'
    ) THEN
        ALTER TABLE public.bonus_activation_skipped 
        ADD CONSTRAINT bonus_activation_skipped_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

-- =====================================================================================
-- Шаг 1: Обновление функции activate_pending_bonuses
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.activate_pending_bonuses()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    order_row RECORD;
    total_activated INT := 0;
    processed_orders INT := 0;
    skipped_orders INT := 0;
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
        ORDER BY o.bonuses_activation_date ASC
        FOR UPDATE OF o SKIP LOCKED
    LOOP
        BEGIN
            -- ✅ Проверяем, что у пользователя достаточно pending бонусов
            IF order_row.current_pending >= order_row.bonuses_awarded THEN
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
            ELSE
                -- Логируем пропуск активации
                INSERT INTO public.bonus_activation_skipped 
                    (order_id, user_id, reason, bonuses_amount, pending_balance)
                VALUES 
                    (order_row.id, order_row.user_id, 
                     'Недостаточно pending бонусов', 
                     order_row.bonuses_awarded, 
                     order_row.current_pending);
                
                skipped_orders := skipped_orders + 1;
            END IF;
            
        EXCEPTION WHEN OTHERS THEN
            -- Логируем ошибку
            INSERT INTO public.bonus_activation_skipped 
                (order_id, user_id, reason, bonuses_amount, pending_balance)
            VALUES 
                (order_row.id, order_row.user_id, 
                 'Ошибка: ' || SQLERRM, 
                 order_row.bonuses_awarded, 
                 order_row.current_pending);
            
            skipped_orders := skipped_orders + 1;
            
            RAISE WARNING 'Ошибка при активации бонусов для заказа %: %', 
                order_row.id, 
                SQLERRM;
        END;
    END LOOP;

    RETURN format(
        'Приветственные бонусы: %s пользователей. Заказы: %s обработано, %s бонусов активировано, %s пропущено.',
        welcome_bonus_users,
        processed_orders,
        total_activated,
        skipped_orders
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
-- Шаг 6: View для мониторинга бонусной системы (базовая версия)
-- =====================================================================================

-- Удаляем старый VIEW, если существует
DROP VIEW IF EXISTS public.bonus_system_status;

-- Создаём базовый VIEW без зависимости от pg_cron
CREATE VIEW public.bonus_system_status AS
SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance > 0) as users_with_pending_bonuses,
    (SELECT COUNT(*) FROM public.profiles WHERE active_bonus_balance > 0) as users_with_active_bonuses,
    (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance < 0 OR active_bonus_balance < 0) as users_with_negative_balance,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'confirmed' AND bonuses_activation_date <= NOW()) as orders_ready_for_activation,
    (SELECT COALESCE(SUM(bonuses_awarded), 0) FROM public.orders WHERE status = 'confirmed' AND bonuses_activation_date <= NOW()) as bonuses_ready_for_activation,
    (SELECT COUNT(*) FROM public.bonus_activation_skipped WHERE created_at > NOW() - INTERVAL '7 days') as skipped_last_7_days;

COMMENT ON VIEW public.bonus_system_status IS 
'Мониторинг состояния бонусной системы';

-- =====================================================================================
-- Шаг 7: Настройка pg_cron (только для продакшена)
-- =====================================================================================

DO $$
BEGIN
    -- Проверяем, доступен ли pg_cron (только в Supabase продакшене)
    IF EXISTS (
        SELECT 1 FROM pg_available_extensions 
        WHERE name = 'pg_cron'
    ) THEN
        -- Включаем расширение, если ещё не включено
        CREATE EXTENSION IF NOT EXISTS pg_cron;
        
        -- Удаляем старое задание, если существует
        IF EXISTS (
            SELECT 1 FROM cron.job 
            WHERE jobname = 'Daily Bonus Activation'
        ) THEN
            PERFORM cron.unschedule('Daily Bonus Activation');
        END IF;
        
        -- Создаём новое задание: каждый день в 2:00 AM UTC
        PERFORM cron.schedule(
            'Daily Bonus Activation',
            '0 2 * * *',
            'SELECT public.activate_pending_bonuses();'
        );
        
        RAISE NOTICE 'pg_cron настроен: задание "Daily Bonus Activation" запланировано на 2:00 AM UTC';
    ELSE
        RAISE NOTICE 'pg_cron недоступен (локальная разработка) - пропускаем настройку cron';
    END IF;
END $$;

-- =====================================================================================
-- Шаг 8: Создание функции для получения статуса cron
-- =====================================================================================

-- Создаём функцию для получения статуса cron (работает в любом окружении)
CREATE OR REPLACE FUNCTION public.get_cron_status()
RETURNS TABLE (
    last_run TIMESTAMPTZ,
    last_status TEXT,
    is_configured BOOLEAN
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    -- Проверяем, доступен ли pg_cron
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        RETURN QUERY
        SELECT 
            (SELECT MAX(start_time) 
             FROM cron.job_run_details jrd 
             JOIN cron.job j ON j.jobid = jrd.jobid 
             WHERE j.jobname = 'Daily Bonus Activation') as last_run,
            (SELECT status 
             FROM cron.job_run_details jrd 
             JOIN cron.job j ON j.jobid = jrd.jobid 
             WHERE j.jobname = 'Daily Bonus Activation' 
             ORDER BY start_time DESC 
             LIMIT 1) as last_status,
            TRUE as is_configured;
    ELSE
        -- Возвращаем NULL для локальной разработки
        RETURN QUERY SELECT NULL::TIMESTAMPTZ, NULL::TEXT, FALSE;
    END IF;
END;
$$;

COMMENT ON FUNCTION public.get_cron_status IS 
'Возвращает статус cron задания (работает как в prod, так и локально)';

-- Пересоздаём VIEW с использованием функции
DROP VIEW IF EXISTS public.bonus_system_status;

CREATE VIEW public.bonus_system_status AS
SELECT 
    (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance > 0) as users_with_pending_bonuses,
    (SELECT COUNT(*) FROM public.profiles WHERE active_bonus_balance > 0) as users_with_active_bonuses,
    (SELECT COUNT(*) FROM public.profiles WHERE pending_bonus_balance < 0 OR active_bonus_balance < 0) as users_with_negative_balance,
    (SELECT COUNT(*) FROM public.orders WHERE status = 'confirmed' AND bonuses_activation_date <= NOW()) as orders_ready_for_activation,
    (SELECT COALESCE(SUM(bonuses_awarded), 0) FROM public.orders WHERE status = 'confirmed' AND bonuses_activation_date <= NOW()) as bonuses_ready_for_activation,
    (SELECT COUNT(*) FROM public.bonus_activation_skipped WHERE created_at > NOW() - INTERVAL '7 days') as skipped_last_7_days,
    cs.last_run as last_cron_run,
    cs.last_status as last_cron_status,
    cs.is_configured as cron_is_configured
FROM public.get_cron_status() cs;

COMMENT ON VIEW public.bonus_system_status IS 
'Мониторинг состояния бонусной системы (работает в любом окружении)';

-- =====================================================================================
-- Шаг 9: Тестовый запуск функции
-- =====================================================================================

-- Запускаем функцию активации для проверки
SELECT public.activate_pending_bonuses();

-- Проверяем статус системы
SELECT * FROM public.bonus_system_status;

-- Проверяем последние пропущенные активации
SELECT * FROM public.bonus_activation_skipped ORDER BY created_at DESC LIMIT 10;

-- =====================================================================================
-- Конец миграции
-- =====================================================================================