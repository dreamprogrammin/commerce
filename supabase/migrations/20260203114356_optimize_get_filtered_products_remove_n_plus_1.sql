-- ============================================================================
-- ОПТИМИЗАЦИЯ: Убираем N+1 запросы из get_filtered_products
-- ============================================================================
--
-- ПРОБЛЕМА:
-- Функция выполняла подзапрос для каждого продукта:
-- (SELECT json_agg(pi) FROM product_images pi WHERE pi.product_id = p.id)
--
-- Это означает:
-- - 24 товара = 24 дополнительных запроса
-- - 100 товаров = 100 дополнительных запросов
--
-- РЕШЕНИЕ:
-- Используем LEFT JOIN с агрегацией через FILTER для получения всех изображений одним запросом
-- ============================================================================

-- Убедимся, что тип attribute_filter существует (создан в более ранней миграции)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attribute_filter' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
        CREATE TYPE public.attribute_filter AS (
            slug TEXT,
            option_ids INTEGER[]
        );
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_brand_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_number INT DEFAULT 1,
    p_page_size INT DEFAULT 12,
    p_attributes public.attribute_filter[] DEFAULT NULL,
    p_country_ids TEXT[] DEFAULT NULL,
    p_material_ids TEXT[] DEFAULT NULL
)
RETURNS TABLE (
    -- Все поля из `products`
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC,
    category_id UUID, bonus_points_award INT, stock_quantity INT,
    sales_count INT, is_active BOOLEAN, min_age_years INT, max_age_years INT,
    gender TEXT, accessory_ids UUID[], is_accessory BOOLEAN, barcode TEXT,
    brand_id UUID, origin_country_id INT, material_id INT, discount_percentage NUMERIC,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    -- Дополнительные поля
    product_images JSON,
    brand_name TEXT,
    brand_slug TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_offset INT;
    v_category_ids UUID[];
BEGIN
    v_offset := (p_page_number - 1) * p_page_size;

    -- Логика для получения всех ID категорий, если slug не 'all'
    IF p_category_slug <> 'all' THEN
      SELECT ARRAY(SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) cat) INTO v_category_ids;
    END IF;

    RETURN QUERY
    WITH filtered_products AS (
        SELECT
            p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
            p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
            p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
            b.name AS brand_name,
            b.slug AS brand_slug
        FROM
            public.products p
        LEFT JOIN
            public.brands b ON p.brand_id = b.id
        WHERE
            p.is_active = TRUE
            -- 1. Фильтр по категориям / подкатегориям
            AND (
                (p_subcategory_ids IS NOT NULL AND CARDINALITY(p_subcategory_ids) > 0 AND p.category_id = ANY(p_subcategory_ids))
                OR
                (
                    (p_subcategory_ids IS NULL OR CARDINALITY(p_subcategory_ids) = 0)
                    AND (p_category_slug = 'all' OR p.category_id = ANY(v_category_ids))
                )
            )
            -- 2. Фильтр по брендам
            AND (p_brand_ids IS NULL OR CARDINALITY(p_brand_ids) = 0 OR p.brand_id = ANY(p_brand_ids))
            -- 3. Фильтр по цене
            AND (p_price_min IS NULL OR p.price >= p_price_min)
            AND (p_price_max IS NULL OR p.price <= p_price_max)
            -- 4. Фильтр по стране происхождения
            AND (p_country_ids IS NULL OR CARDINALITY(p_country_ids) = 0
                OR p.origin_country_id = ANY(ARRAY(SELECT unnest(p_country_ids)::INTEGER)))
            -- 5. Фильтр по материалу
            AND (p_material_ids IS NULL OR CARDINALITY(p_material_ids) = 0
                OR p.material_id = ANY(ARRAY(SELECT unnest(p_material_ids)::INTEGER)))
            -- 6. Фильтр по динамическим атрибутам
            AND (
                p_attributes IS NULL OR
                (
                    SELECT bool_and(EXISTS (
                        SELECT 1 FROM public.product_attribute_values pav
                        JOIN public.attributes a ON pav.attribute_id = a.id
                        WHERE pav.product_id = p.id AND a.slug = attr_filter.slug AND pav.option_id = ANY(attr_filter.option_ids)
                    ))
                    FROM unnest(p_attributes) AS attr_filter
                )
            )
        ORDER BY
            CASE p_sort_by
                WHEN 'popularity' THEN p.sales_count END DESC NULLS LAST,
            CASE p_sort_by
                WHEN 'newest' THEN p.created_at END DESC NULLS LAST,
            CASE p_sort_by
                WHEN 'price_asc' THEN p.price END ASC NULLS LAST,
            CASE p_sort_by
                WHEN 'price_desc' THEN p.price END DESC NULLS LAST,
            p.name ASC
        LIMIT p_page_size
        OFFSET v_offset
    )
    -- ✅ ОПТИМИЗАЦИЯ: Получаем изображения для всех отфильтрованных товаров одним JOIN
    SELECT
        fp.id, fp.name, fp.slug, fp.description, fp.price, fp.category_id, fp.bonus_points_award, fp.stock_quantity,
        fp.sales_count, fp.is_active, fp.min_age_years, fp.max_age_years, fp.gender, fp.accessory_ids, fp.is_accessory,
        fp.barcode, fp.brand_id, fp.origin_country_id, fp.material_id, fp.discount_percentage, fp.created_at, fp.updated_at,
        -- Собираем все изображения в один JSON массив через json_agg с FILTER
        COALESCE(
            json_agg(
                json_build_object(
                    'id', pi.id,
                    'product_id', pi.product_id,
                    'image_url', pi.image_url,
                    'alt_text', pi.alt_text,
                    'display_order', pi.display_order,
                    'blur_placeholder', pi.blur_placeholder,
                    'created_at', pi.created_at,
                    'updated_at', pi.updated_at
                ) ORDER BY pi.display_order
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
        ) AS product_images,
        fp.brand_name,
        fp.brand_slug
    FROM
        filtered_products fp
    LEFT JOIN
        public.product_images pi ON pi.product_id = fp.id
    GROUP BY
        fp.id, fp.name, fp.slug, fp.description, fp.price, fp.category_id, fp.bonus_points_award, fp.stock_quantity,
        fp.sales_count, fp.is_active, fp.min_age_years, fp.max_age_years, fp.gender, fp.accessory_ids, fp.is_accessory,
        fp.barcode, fp.brand_id, fp.origin_country_id, fp.material_id, fp.discount_percentage, fp.created_at, fp.updated_at,
        fp.brand_name, fp.brand_slug
    ORDER BY
        CASE p_sort_by
            WHEN 'popularity' THEN fp.sales_count END DESC NULLS LAST,
        CASE p_sort_by
            WHEN 'newest' THEN fp.created_at END DESC NULLS LAST,
        CASE p_sort_by
            WHEN 'price_asc' THEN fp.price END ASC NULLS LAST,
        CASE p_sort_by
            WHEN 'price_desc' THEN fp.price END DESC NULLS LAST,
        fp.name ASC;
END;
$$;

COMMENT ON FUNCTION public.get_filtered_products IS
'Возвращает отфильтрованный список товаров с изображениями. Оптимизировано: убран N+1 query для product_images.';

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
