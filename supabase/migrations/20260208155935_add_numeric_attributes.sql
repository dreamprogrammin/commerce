-- ============================================================================
-- ЧИСЛОВЫЕ АТРИБУТЫ ТОВАРОВ
-- ============================================================================
-- Расширяем систему атрибутов для поддержки числовых значений
-- (количество деталей, высота, вес и т.д.) с фильтрацией диапазоном
-- ============================================================================

-- 1. Добавляем numeric_value в product_attribute_values
ALTER TABLE public.product_attribute_values
ADD COLUMN IF NOT EXISTS numeric_value NUMERIC DEFAULT NULL;

COMMENT ON COLUMN public.product_attribute_values.numeric_value IS
'Числовое значение атрибута (для display_type = numeric). Например: 175 деталей, 50 см высота';

-- 2. Добавляем unit (единица измерения) в attributes
ALTER TABLE public.attributes
ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT NULL;

COMMENT ON COLUMN public.attributes.unit IS
'Единица измерения для числовых атрибутов (шт, см, кг, мл и т.д.)';

-- 3. Создаём тип для фильтрации по числовым атрибутам (если не существует)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'numeric_attribute_filter') THEN
        CREATE TYPE public.numeric_attribute_filter AS (
            attribute_id INTEGER,
            min_value NUMERIC,
            max_value NUMERIC
        );
    END IF;
END $$;

-- 4. RPC для получения диапазона числового атрибута в категории
CREATE OR REPLACE FUNCTION public.get_numeric_attribute_range(
    p_category_slug TEXT,
    p_attribute_id INTEGER
)
RETURNS TABLE (min_value NUMERIC, max_value NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH category_tree AS (
        SELECT id FROM public.get_category_and_children_ids(p_category_slug)
    )
    SELECT
        MIN(pav.numeric_value)::NUMERIC AS min_value,
        MAX(pav.numeric_value)::NUMERIC AS max_value
    FROM public.product_attribute_values pav
    JOIN public.products p ON pav.product_id = p.id
    WHERE pav.attribute_id = p_attribute_id
      AND pav.numeric_value IS NOT NULL
      AND p.category_id IN (SELECT id FROM category_tree)
      AND p.is_active = true;
END;
$$;

COMMENT ON FUNCTION public.get_numeric_attribute_range(TEXT, INTEGER) IS
'Возвращает минимальное и максимальное значение числового атрибута для товаров в указанной категории';

-- 5. Обновляем get_filtered_products для поддержки числовых атрибутов
-- Удаляем все версии функции
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure as func_signature
        FROM pg_proc
        WHERE proname = 'get_filtered_products'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION %s CASCADE', r.func_signature);
    END LOOP;
END $$;

-- Создаем обновленную версию с фильтром по числовым атрибутам
CREATE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_brand_ids TEXT[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_number INT DEFAULT 1,
    p_page_size INT DEFAULT 12,
    p_attributes public.attribute_filter[] DEFAULT NULL,
    p_country_ids TEXT[] DEFAULT NULL,
    p_material_ids TEXT[] DEFAULT NULL,
    p_product_line_ids TEXT[] DEFAULT NULL,
    p_piece_count_min INT DEFAULT NULL,
    p_piece_count_max INT DEFAULT NULL,
    p_numeric_attributes public.numeric_attribute_filter[] DEFAULT NULL
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
SET search_path = public
AS $$
DECLARE
    v_offset INT;
    v_category_ids UUID[];
    v_subcategory_ids_expanded UUID[];
BEGIN
    v_offset := (p_page_number - 1) * p_page_size;

    -- Если переданы подкатегории, расширяем их рекурсивно (включая дочерние категории)
    IF p_subcategory_ids IS NOT NULL AND CARDINALITY(p_subcategory_ids) > 0 THEN
        SELECT ARRAY(
            SELECT DISTINCT cat.id
            FROM unnest(p_subcategory_ids) AS parent_id
            CROSS JOIN LATERAL public.get_category_and_children_ids_by_uuid(parent_id) cat
        ) INTO v_subcategory_ids_expanded;
    END IF;

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
            -- 1. Фильтр по категориям / подкатегориям (с рекурсивной поддержкой дочерних категорий)
            AND (
                -- Если выбраны подкатегории, используем расширенный массив (включая дочерние)
                (v_subcategory_ids_expanded IS NOT NULL AND CARDINALITY(v_subcategory_ids_expanded) > 0
                    AND p.category_id = ANY(v_subcategory_ids_expanded))
                OR
                -- Иначе используем категорию из slug
                (
                    (v_subcategory_ids_expanded IS NULL OR CARDINALITY(v_subcategory_ids_expanded) = 0)
                    AND (p_category_slug = 'all' OR p.category_id = ANY(v_category_ids))
                )
            )
            -- 2. Фильтр по брендам (TEXT[] -> UUID[])
            AND (p_brand_ids IS NULL OR CARDINALITY(p_brand_ids) = 0
                OR p.brand_id = ANY(ARRAY(SELECT unnest(p_brand_ids)::UUID)))
            -- 3. Фильтр по линейкам продуктов (TEXT[] -> UUID[])
            AND (p_product_line_ids IS NULL OR CARDINALITY(p_product_line_ids) = 0
                OR p.product_line_id = ANY(ARRAY(SELECT unnest(p_product_line_ids)::UUID)))
            -- 4. Фильтр по цене
            AND (p_price_min IS NULL OR p.price >= p_price_min)
            AND (p_price_max IS NULL OR p.price <= p_price_max)
            -- 5. Фильтр по стране происхождения (TEXT[] -> INTEGER[])
            AND (p_country_ids IS NULL OR CARDINALITY(p_country_ids) = 0
                OR p.origin_country_id = ANY(ARRAY(SELECT unnest(p_country_ids)::INTEGER)))
            -- 6. Фильтр по материалу (TEXT[] -> INTEGER[])
            AND (p_material_ids IS NULL OR CARDINALITY(p_material_ids) = 0
                OR p.material_id = ANY(ARRAY(SELECT unnest(p_material_ids)::INTEGER)))
            -- 7. Фильтр по динамическим атрибутам (select/color)
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
            -- 8. Фильтр по количеству деталей (piece_count в products)
            AND (p_piece_count_min IS NULL OR p.piece_count >= p_piece_count_min)
            AND (p_piece_count_max IS NULL OR p.piece_count <= p_piece_count_max)
            -- 9. Фильтр по числовым атрибутам (numeric_value в product_attribute_values)
            AND (
                p_numeric_attributes IS NULL OR
                (
                    SELECT bool_and(EXISTS (
                        SELECT 1 FROM public.product_attribute_values pav
                        WHERE pav.product_id = p.id
                          AND pav.attribute_id = num_filter.attribute_id
                          AND pav.numeric_value IS NOT NULL
                          AND (num_filter.min_value IS NULL OR pav.numeric_value >= num_filter.min_value)
                          AND (num_filter.max_value IS NULL OR pav.numeric_value <= num_filter.max_value)
                    ))
                    FROM unnest(p_numeric_attributes) AS num_filter
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
    -- Получаем изображения для всех отфильтрованных товаров одним JOIN
    SELECT
        fp.id, fp.name, fp.slug, fp.description, fp.price, fp.category_id, fp.bonus_points_award, fp.stock_quantity,
        fp.sales_count, fp.is_active, fp.min_age_years, fp.max_age_years, fp.gender, fp.accessory_ids, fp.is_accessory,
        fp.barcode, fp.brand_id, fp.origin_country_id, fp.material_id, fp.discount_percentage, fp.created_at, fp.updated_at,
        COALESCE(
            json_agg(
                json_build_object(
                    'id', pi.id,
                    'product_id', pi.product_id,
                    'image_url', pi.image_url,
                    'alt_text', pi.alt_text,
                    'display_order', pi.display_order,
                    'blur_placeholder', pi.blur_placeholder,
                    'created_at', pi.created_at
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

COMMENT ON FUNCTION public.get_filtered_products(
    TEXT, UUID[], TEXT[], NUMERIC, NUMERIC, TEXT, INT, INT,
    public.attribute_filter[], TEXT[], TEXT[], TEXT[], INT, INT, public.numeric_attribute_filter[]
) IS
'Возвращает отфильтрованный список товаров с изображениями. Поддерживает фильтры по: категориям, брендам, цене, атрибутам (select/color), piece_count и числовым атрибутам (numeric).';

-- 6. Индекс для ускорения поиска по numeric_value
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_numeric
ON public.product_attribute_values (attribute_id, numeric_value)
WHERE numeric_value IS NOT NULL;

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
