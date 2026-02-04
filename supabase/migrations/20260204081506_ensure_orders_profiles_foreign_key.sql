-- ============================================================================
-- FIX: Гарантируем наличие foreign key между orders.user_id и profiles.id
-- ============================================================================
-- ПРОБЛЕМА:
-- Edge Function получает ошибку PGRST200:
-- "Could not find a relationship between 'orders' and 'profiles' in the schema cache"
--
-- Это происходит когда PostgREST не видит foreign key constraint,
-- хотя он может существовать в базе данных
--
-- РЕШЕНИЕ:
-- 1. Убеждаемся что foreign key существует
-- 2. Если нет - создаём
-- 3. Принудительно обновляем кэш PostgREST
-- ============================================================================

-- Проверяем и создаём foreign key если его нет
DO $$
BEGIN
    -- Проверяем существование constraint
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_user_id_fkey'
          AND conrelid = 'orders'::regclass
    ) THEN
        -- Добавляем foreign key
        ALTER TABLE public.orders
        ADD CONSTRAINT orders_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES public.profiles(id)
        ON DELETE SET NULL;

        RAISE NOTICE 'Created foreign key: orders_user_id_fkey';
    ELSE
        RAISE NOTICE 'Foreign key orders_user_id_fkey already exists';
    END IF;
END $$;

-- Создаём индекс на user_id если его нет (для производительности JOIN)
CREATE INDEX IF NOT EXISTS idx_orders_user_id_profile
ON public.orders(user_id)
WHERE user_id IS NOT NULL;

-- Проверяем и создаём foreign key для guest_checkouts (если таблица существует)
DO $$
BEGIN
    -- Проверяем существование таблицы guest_checkouts
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'guest_checkouts'
    ) THEN
        -- Проверяем наличие колонки linked_profile_id
        IF EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'guest_checkouts'
              AND column_name = 'linked_profile_id'
        ) THEN
            -- Проверяем существование constraint
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = 'guest_checkouts_linked_profile_id_fkey'
                  AND conrelid = 'guest_checkouts'::regclass
            ) THEN
                -- Добавляем foreign key
                ALTER TABLE public.guest_checkouts
                ADD CONSTRAINT guest_checkouts_linked_profile_id_fkey
                FOREIGN KEY (linked_profile_id)
                REFERENCES public.profiles(id)
                ON DELETE SET NULL;

                RAISE NOTICE 'Created foreign key: guest_checkouts_linked_profile_id_fkey';
            END IF;
        END IF;
    END IF;
END $$;

COMMENT ON CONSTRAINT orders_user_id_fkey ON public.orders IS
'Foreign key linking orders to user profiles. Required for PostgREST nested queries in Edge Functions.';

-- Принудительно обновляем кэш PostgREST (КРИТИЧНО!)
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Даём PostgREST время на обработку
SELECT pg_sleep(1);

-- Ещё раз уведомляем для надёжности
NOTIFY pgrst, 'reload schema';

-- Проверяем что constraint существует
DO $$
DECLARE
    v_constraint_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_user_id_fkey'
          AND conrelid = 'orders'::regclass
          AND confrelid = 'profiles'::regclass
    ) INTO v_constraint_exists;

    IF v_constraint_exists THEN
        RAISE NOTICE '✅ Foreign key orders_user_id_fkey verified';
    ELSE
        RAISE EXCEPTION '❌ Foreign key orders_user_id_fkey not found after creation';
    END IF;
END $$;
