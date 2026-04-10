-- Добавление поля delivery_cost в таблицу orders
ALTER TABLE orders
ADD COLUMN delivery_cost NUMERIC(10, 2) DEFAULT 0 NOT NULL;

-- Комментарий к полю
COMMENT ON COLUMN orders.delivery_cost IS 'Стоимость доставки для заказа';
