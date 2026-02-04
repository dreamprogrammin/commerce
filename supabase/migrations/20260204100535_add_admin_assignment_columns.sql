-- ============================================================================
-- ADD: Колонки для назначения админа на заказ
-- ============================================================================
-- ПРОБЛЕМА:
-- Edge Function assign-order-to-admin пытается обновить:
-- - assigned_admin_name
-- - assigned_admin_username
-- - assigned_at
-- Но эти колонки отсутствуют на продакшене
--
-- РЕШЕНИЕ:
-- Добавляем колонки для отслеживания назначенного админа в обе таблицы
-- ============================================================================

-- Добавляем колонки в orders
DO $$
BEGIN
    -- assigned_admin_name
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'assigned_admin_name'
    ) THEN
        ALTER TABLE public.orders
        ADD COLUMN assigned_admin_name TEXT;
        RAISE NOTICE 'Added column: orders.assigned_admin_name';
    END IF;

    -- assigned_admin_username
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'assigned_admin_username'
    ) THEN
        ALTER TABLE public.orders
        ADD COLUMN assigned_admin_username TEXT;
        RAISE NOTICE 'Added column: orders.assigned_admin_username';
    END IF;

    -- assigned_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'assigned_at'
    ) THEN
        ALTER TABLE public.orders
        ADD COLUMN assigned_at TIMESTAMPTZ;
        RAISE NOTICE 'Added column: orders.assigned_at';
    END IF;
END $$;

-- Добавляем колонки в guest_checkouts
DO $$
BEGIN
    -- assigned_admin_name
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'guest_checkouts'
          AND column_name = 'assigned_admin_name'
    ) THEN
        ALTER TABLE public.guest_checkouts
        ADD COLUMN assigned_admin_name TEXT;
        RAISE NOTICE 'Added column: guest_checkouts.assigned_admin_name';
    END IF;

    -- assigned_admin_username
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'guest_checkouts'
          AND column_name = 'assigned_admin_username'
    ) THEN
        ALTER TABLE public.guest_checkouts
        ADD COLUMN assigned_admin_username TEXT;
        RAISE NOTICE 'Added column: guest_checkouts.assigned_admin_username';
    END IF;

    -- assigned_at
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'guest_checkouts'
          AND column_name = 'assigned_at'
    ) THEN
        ALTER TABLE public.guest_checkouts
        ADD COLUMN assigned_at TIMESTAMPTZ;
        RAISE NOTICE 'Added column: guest_checkouts.assigned_at';
    END IF;
END $$;

-- Создаём индексы для поиска заказов по назначенному админу
CREATE INDEX IF NOT EXISTS idx_orders_assigned_admin
ON public.orders(assigned_admin_name)
WHERE assigned_admin_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guest_checkouts_assigned_admin
ON public.guest_checkouts(assigned_admin_name)
WHERE assigned_admin_name IS NOT NULL;

-- Комментарии
COMMENT ON COLUMN public.orders.assigned_admin_name IS
'Имя админа, который взял заказ в работу';

COMMENT ON COLUMN public.orders.assigned_admin_username IS
'Telegram username админа';

COMMENT ON COLUMN public.orders.assigned_at IS
'Дата и время назначения админа на заказ';

COMMENT ON COLUMN public.guest_checkouts.assigned_admin_name IS
'Имя админа, который взял гостевой заказ в работу';

COMMENT ON COLUMN public.guest_checkouts.assigned_admin_username IS
'Telegram username админа для гостевого заказа';

COMMENT ON COLUMN public.guest_checkouts.assigned_at IS
'Дата и время назначения админа на гостевой заказ';

-- Принудительно обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
