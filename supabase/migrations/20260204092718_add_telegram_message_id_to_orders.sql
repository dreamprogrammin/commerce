-- ============================================================================
-- ADD: telegram_message_id колонка для orders и guest_checkouts
-- ============================================================================
-- ПРОБЛЕМА:
-- Edge Function notify-order-to-telegram пытается сохранить telegram_message_id,
-- но колонка отсутствует на продакшене
-- Ошибка PGRST204: Could not find the 'telegram_message_id' column
--
-- РЕШЕНИЕ:
-- Добавляем колонку telegram_message_id в обе таблицы для отслеживания
-- отправленных сообщений в Telegram (нужно для обновления статуса)
-- ============================================================================

-- Добавляем колонку в orders если её нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'orders'
          AND column_name = 'telegram_message_id'
    ) THEN
        ALTER TABLE public.orders
        ADD COLUMN telegram_message_id TEXT;

        RAISE NOTICE 'Added column: orders.telegram_message_id';
    ELSE
        RAISE NOTICE 'Column orders.telegram_message_id already exists';
    END IF;
END $$;

-- Добавляем колонку в guest_checkouts если её нет
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'guest_checkouts'
          AND column_name = 'telegram_message_id'
    ) THEN
        ALTER TABLE public.guest_checkouts
        ADD COLUMN telegram_message_id TEXT;

        RAISE NOTICE 'Added column: guest_checkouts.telegram_message_id';
    ELSE
        RAISE NOTICE 'Column guest_checkouts.telegram_message_id already exists';
    END IF;
END $$;

-- Добавляем индексы для быстрого поиска по telegram_message_id
CREATE INDEX IF NOT EXISTS idx_orders_telegram_message_id
ON public.orders(telegram_message_id)
WHERE telegram_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_guest_checkouts_telegram_message_id
ON public.guest_checkouts(telegram_message_id)
WHERE telegram_message_id IS NOT NULL;

COMMENT ON COLUMN public.orders.telegram_message_id IS
'ID сообщения в Telegram для обновления статуса заказа';

COMMENT ON COLUMN public.guest_checkouts.telegram_message_id IS
'ID сообщения в Telegram для обновления статуса гостевого заказа';

-- Принудительно обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
