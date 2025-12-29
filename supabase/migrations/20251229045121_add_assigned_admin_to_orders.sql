-- Файл: supabase/migrations/20251229045121_add_assigned_admin_to_orders.sql
-- Назначение: Добавляет информацию об ответственном админе для заказов

-- 1. Добавляем колонку assigned_admin_name в таблицу orders
ALTER TABLE orders
ADD COLUMN assigned_admin_name TEXT;

-- 2. Добавляем колонку assigned_admin_username в таблицу orders (username из Telegram)
ALTER TABLE orders
ADD COLUMN assigned_admin_username TEXT;

-- 3. Добавляем колонку assigned_at (когда взяли в работу)
ALTER TABLE orders
ADD COLUMN assigned_at TIMESTAMPTZ;

-- 4. Добавляем те же колонки для guest_checkouts
ALTER TABLE guest_checkouts
ADD COLUMN assigned_admin_name TEXT;

ALTER TABLE guest_checkouts
ADD COLUMN assigned_admin_username TEXT;

ALTER TABLE guest_checkouts
ADD COLUMN assigned_at TIMESTAMPTZ;

-- Комментарии для документации
COMMENT ON COLUMN orders.assigned_admin_name IS 'Имя админа, который взял заказ в работу (из Telegram)';
COMMENT ON COLUMN orders.assigned_admin_username IS 'Username админа из Telegram (без @)';
COMMENT ON COLUMN orders.assigned_at IS 'Время когда заказ взяли в работу';

COMMENT ON COLUMN guest_checkouts.assigned_admin_name IS 'Имя админа, который взял гостевой заказ в работу (из Telegram)';
COMMENT ON COLUMN guest_checkouts.assigned_admin_username IS 'Username админа из Telegram (без @)';
COMMENT ON COLUMN guest_checkouts.assigned_at IS 'Время когда гостевой заказ взяли в работу';
