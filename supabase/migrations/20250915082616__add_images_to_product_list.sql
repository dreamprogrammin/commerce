-- Обновляем функцию get_filtered_products, чтобы она для каждого товара
-- возвращала вложенный массив его изображений.

-- Сначала удалим старую версию, чтобы избежать конфликтов с типами возвращаемых данных
DROP FUNCTION IF EXISTS public.get_filtered_products(text, uuid[], numeric, numeric, text, integer, integer);

-- Создаем новую версию
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_size INT DEFAULT 12,
    p_page_number INT DEFAULT 1
)
-- Определяем структуру возвращаемой таблицы
RETURNS TABLE (
    -- Все колонки из `products`
    id UUID, name TEXT, slug TEXT, price NUMERIC, description TEXT, category_id UUID,
    stock_quantity INT, is_active BOOLEAN, sales_count INT, bonus_points_award INT,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, min_age INT, max_age INT, gender TEXT,
    -- ПЛЮС новое поле, которое будет содержать массив JSON
    product_images JSONB[]
) AS $$
BEGIN
  RETURN QUERY
  -- Используем CTE (Common Table Expression) для чистоты
  WITH products_with_images AS (
    SELECT
      p.*, -- Берем все поля из products
      -- И для каждого продукта собираем его изображения в массив JSON-объектов
      (
        SELECT COALESCE(array_agg(jsonb_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order)), '{}')
        FROM public.product_images pi
        WHERE pi.product_id = p.id
      ) as product_images
    FROM public.products p
  )
  -- Теперь выбираем из этой "виртуальной" таблицы
  SELECT
    pi.id, pi.name, pi.slug, pi.price, pi.description, pi.category_id,
    pi.stock_quantity, pi.is_active, pi.sales_count, pi.bonus_points_award,
    pi.created_at, pi.updated_at, pi.min_age, pi.max_age, pi.gender,
    pi.product_images
  FROM products_with_images pi
  WHERE
    pi.is_active = TRUE
    -- ... (вся ваша существующая логика WHERE и ORDER BY, но теперь с `pi.`) ...
  LIMIT p_page_size
  OFFSET (p_page_number - 1) * p_page_size;
END;
$$ LANGUAGE plpgsql;