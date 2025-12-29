-- Add telegram_message_id to orders table for tracking Telegram notifications
ALTER TABLE orders
ADD COLUMN telegram_message_id TEXT;

-- Add telegram_message_id to guest_checkouts table for tracking Telegram notifications
ALTER TABLE guest_checkouts
ADD COLUMN telegram_message_id TEXT;

-- Add comments for documentation
COMMENT ON COLUMN orders.telegram_message_id IS 'ID сообщения в Telegram для обновления статуса у всех админов';
COMMENT ON COLUMN guest_checkouts.telegram_message_id IS 'ID сообщения в Telegram для обновления статуса у всех админов';
