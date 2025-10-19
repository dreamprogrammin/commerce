-- Up Migration: Расширяем RPC-функцию для фильтрации по атрибутам

-- Сначала определяем новый тип данных, который будем передавать в функцию.
-- Это будет массив объектов, где каждый объект - это { "slug": "color", "option_ids": [1, 3] }
CREATE TYPE public.attribute_filter AS (
  slug TEXT,
  option_ids INTEGER[]
);

-- Теперь пересоздаем основную функцию с новым параметром
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[],
    p_brand_ids UUID[],
    p_price_min NUMERIC,
    p_price_max NUMERIC,
    p_sort_by TEXT,
    p_page_number INT,
    p_page_size INT,
    p_attributes public.attribute_filter[] DEFAULT NULL -- <-- НОВЫЙ ПАРАМЕТР
)
RETURNS TABLE (
    -- ... (все колонки, которые возвращает ваша функция, остаются без изменений)
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC, 
    bonus_points_award INT, stock_quantity INT, sales_count INT, 
    is_active BOOLEAN, min_age_years INT, max_age_years INT, gender TEXT, 
    is_accessory BOOLEAN, accessory_ids UUID[], barcode TEXT, 
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, category_id UUID, 
    brand_id UUID, origin_country_id INT, material_id INT, discount_percentage NUMERIC,
    product_images JSON[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_category_ids UUID[];
    v_offset INT;
BEGIN
    -- 1. Определяем, по каким категориям искать
    IF p_category_slug = 'all' THEN
        -- Если 'all', ищем по всем категориям
        SELECT ARRAY_AGG(c.id) INTO v_category_ids FROM public.categories c;
    ELSE
        -- Иначе, ищем по указанной категории и всем ее дочерним
        SELECT ARRAY_AGG(cat.id) INTO v_category_ids FROM public.get_category_and_children_ids(p_category_slug) cat;
    END IF;

    -- 2. Рассчитываем сдвиг для пагинации
    v_offset := (p_page_number - 1) * p_page_size;

    -- 3. Основной запрос
    RETURN QUERY
    SELECT
        p.*, -- Выбираем все колонки из таблицы products
        ARRAY_AGG(
            JSON_BUILD_OBJECT('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order, 'alt_text', pi.alt_text)
        ) FILTER (WHERE pi.id IS NOT NULL) AS product_images
    FROM
        public.products p
    LEFT JOIN
        public.product_images pi ON p.id = pi.product_id
    WHERE
        p.is_active = TRUE
        -- Фильтр по категориям/подкатегориям
        AND (
            (p_subcategory_ids IS NULL OR CARDINALITY(p_subcategory_ids) = 0 AND p.category_id = ANY(v_category_ids))
            OR
            (p_subcategory_ids IS NOT NULL AND p.category_id = ANY(p_subcategory_ids))
        )
        -- Фильтр по брендам
        AND (p_brand_ids IS NULL OR CARDINALITY(p_brand_ids) = 0 OR p.brand_id = ANY(p_brand_ids))
        -- Фильтр по цене
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
        
        -- <-- НОВАЯ ЛОГИКА ФИЛЬТРАЦИИ ПО АТРИБУТАМ -->
        AND (
            p_attributes IS NULL OR
            -- Эта магия проверяет, что для КАЖДОГО фильтра по атрибуту, переданного в p_attributes,
            -- у товара есть соответствующее значение.
            (
                SELECT bool_and(
                    EXISTS (
                        SELECT 1
                        FROM public.product_attribute_values pav
                        JOIN public.attributes a ON pav.attribute_id = a.id
                        WHERE pav.product_id = p.id
                          AND a.slug = attr_filter.slug
                          AND pav.option_id = ANY(attr_filter.option_ids)
                    )
                )
                FROM unnest(p_attributes) AS attr_filter
            )
        )
        
    GROUP BY
        p.id
    -- Сортировка
    ORDER BY
        CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC,
        CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC,
        CASE WHEN p_sort_by = 'price_asc' THEN p.price END ASC,
        CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC
    -- Пагинация
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;


/*
-- Down Migration (Закомментировано)
-- Здесь нужно было бы вернуть старую версию функции
*/