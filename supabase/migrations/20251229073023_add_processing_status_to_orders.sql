-- Добавляем статус 'processing' для заказов в работе (между pending и confirmed)
-- Также добавляем 'pending' и 'delivered' для лучшей читаемости

-- Обновляем CHECK constraint для таблицы orders
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
ADD CONSTRAINT orders_status_check
CHECK (status IN ('pending', 'new', 'processing', 'confirmed', 'delivered', 'shipped', 'completed', 'cancelled'));

-- Обновляем CHECK constraint для таблицы guest_checkouts
ALTER TABLE guest_checkouts
DROP CONSTRAINT IF EXISTS guest_checkouts_status_check;

ALTER TABLE guest_checkouts
ADD CONSTRAINT guest_checkouts_status_check
CHECK (status IN ('pending', 'new', 'processing', 'confirmed', 'delivered', 'shipped', 'completed', 'cancelled'));

-- Комментарии для понимания статусов
COMMENT ON COLUMN orders.status IS 'Статус заказа: pending/new (новый) -> processing (в работе, уточнение деталей) -> confirmed (подтверждён клиентом) -> delivered/shipped (доставлен) -> completed (завершён) | cancelled (отменён)';
COMMENT ON COLUMN guest_checkouts.status IS 'Статус заказа: pending/new (новый) -> processing (в работе, уточнение деталей) -> confirmed (подтверждён клиентом) -> delivered/shipped (доставлен) -> completed (завершён) | cancelled (отменён)';
