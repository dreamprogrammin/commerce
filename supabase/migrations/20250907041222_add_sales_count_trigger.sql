-- Миграция для автоматического обновления счетчика популярности товаров (sales_count).

-- 1. Создаем триггерную функцию.
-- Эта функция будет вызываться после вставки строк в `order_items`.
-- Она находит соответствующие товары в таблице `products` и увеличивает
-- их счетчик `sales_count` на количество купленных единиц.

CREATE OR REPLACE FUNCTION public.update_product_sales_count()
RETURNS TRIGGER AS $$
BEGIN
    -- Обновляем таблицу `products`.
    -- Увеличиваем `sales_count` для товара, ID которого (`product_id`)
    -- совпадает с ID в только что вставленной строке (`NEW.product_id`).
    -- Увеличиваем на количество (`quantity`) из новой строки.
    UPDATE public.products
    SET sales_count = sales_count + NEW.quantity
    WHERE id = NEW.product_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Создаем сам триггер.
-- Этот триггер будет "слушать" таблицу `order_items`.

-- Сначала удаляем старый триггер, если он вдруг существует, чтобы избежать ошибок.
DROP TRIGGER IF EXISTS on_order_item_insert_update_sales_count ON public.order_items;

-- Создаем новый триггер.
CREATE TRIGGER on_order_item_insert_update_sales_count
    -- Он будет срабатывать ПОСЛЕ (AFTER) каждой ВСТАВКИ (INSERT)
    AFTER INSERT ON public.order_items
    -- Для каждой вставленной строки (FOR EACH ROW)
    FOR EACH ROW
    -- Будет выполняться наша функция (EXECUTE FUNCTION)
    EXECUTE FUNCTION public.update_product_sales_count();