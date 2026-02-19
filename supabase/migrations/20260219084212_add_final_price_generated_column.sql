-- ============================================================================
-- GENERATED COLUMN: final_price (цена с учётом скидки)
-- ============================================================================
-- Заменяет вычисление p.price * (100 - discount) / 100 на готовую колонку.
-- PostgreSQL автоматически пересчитывает при UPDATE price/discount_percentage.
-- Индекс по final_price делает сортировку и фильтрацию по цене мгновенными.
-- ============================================================================

-- 1. Добавляем generated column
ALTER TABLE public.products
ADD COLUMN final_price NUMERIC
  GENERATED ALWAYS AS (price * (100 - COALESCE(discount_percentage, 0)) / 100) STORED;

-- 2. Индексы по final_price для сортировки в каталоге
CREATE INDEX IF NOT EXISTS idx_products_active_category_final_price_asc
ON public.products (category_id, final_price ASC, name ASC)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_active_category_final_price_desc
ON public.products (category_id, final_price DESC, name ASC)
WHERE is_active = TRUE;

-- Удаляем старые индексы на вычисляемую цену (заменены final_price)
DROP INDEX IF EXISTS idx_products_active_category_price_asc;
DROP INDEX IF EXISTS idx_products_active_category_price_desc;


-- ============================================================================
-- 3. Обновляем get_filtered_products — используем final_price
-- ============================================================================

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
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC,
    category_id UUID, bonus_points_award INT, stock_quantity INT,
    sales_count INT, is_active BOOLEAN, min_age_years INT, max_age_years INT,
    gender TEXT, accessory_ids UUID[], is_accessory BOOLEAN, barcode TEXT,
    brand_id UUID, origin_country_id INT, material_id INT, discount_percentage NUMERIC,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    product_images JSON,
    brand_name TEXT,
    brand_slug TEXT
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
    v_offset INT;
    v_category_ids UUID[];
    v_subcategory_ids_expanded UUID[];
    v_brand_uuids UUID[];
    v_country_ints INTEGER[];
    v_material_ints INTEGER[];
    v_product_line_uuids UUID[];
BEGIN
    v_offset := (p_page_number - 1) * p_page_size;

    -- Pre-cast TEXT[] параметров один раз
    IF p_brand_ids IS NOT NULL AND CARDINALITY(p_brand_ids) > 0 THEN
        SELECT ARRAY(SELECT unnest(p_brand_ids)::UUID) INTO v_brand_uuids;
    END IF;

    IF p_country_ids IS NOT NULL AND CARDINALITY(p_country_ids) > 0 THEN
        SELECT ARRAY(SELECT unnest(p_country_ids)::INTEGER) INTO v_country_ints;
    END IF;

    IF p_material_ids IS NOT NULL AND CARDINALITY(p_material_ids) > 0 THEN
        SELECT ARRAY(SELECT unnest(p_material_ids)::INTEGER) INTO v_material_ints;
    END IF;

    IF p_product_line_ids IS NOT NULL AND CARDINALITY(p_product_line_ids) > 0 THEN
        SELECT ARRAY(SELECT unnest(p_product_line_ids)::UUID) INTO v_product_line_uuids;
    END IF;

    IF p_subcategory_ids IS NOT NULL AND CARDINALITY(p_subcategory_ids) > 0 THEN
        SELECT ARRAY(
            SELECT DISTINCT cat.id
            FROM unnest(p_subcategory_ids) AS parent_id
            CROSS JOIN LATERAL public.get_category_and_children_ids_by_uuid(parent_id) cat
        ) INTO v_subcategory_ids_expanded;
    END IF;

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
            b.slug AS brand_slug,
            p.final_price,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE p_sort_by WHEN 'popularity' THEN p.sales_count END DESC NULLS LAST,
                    CASE p_sort_by WHEN 'newest' THEN p.created_at END DESC NULLS LAST,
                    CASE p_sort_by WHEN 'price_asc' THEN p.final_price END ASC NULLS LAST,
                    CASE p_sort_by WHEN 'price_desc' THEN p.final_price END DESC NULLS LAST,
                    p.name ASC
            ) AS sort_order
        FROM
            public.products p
        LEFT JOIN
            public.brands b ON p.brand_id = b.id
        WHERE
            p.is_active = TRUE
            AND (
                (v_subcategory_ids_expanded IS NOT NULL AND CARDINALITY(v_subcategory_ids_expanded) > 0
                    AND p.category_id = ANY(v_subcategory_ids_expanded))
                OR
                (
                    (v_subcategory_ids_expanded IS NULL OR CARDINALITY(v_subcategory_ids_expanded) = 0)
                    AND (p_category_slug = 'all' OR p.category_id = ANY(v_category_ids))
                )
            )
            AND (v_brand_uuids IS NULL OR p.brand_id = ANY(v_brand_uuids))
            AND (v_product_line_uuids IS NULL OR p.product_line_id = ANY(v_product_line_uuids))
            AND (p_price_min IS NULL OR p.final_price >= p_price_min)
            AND (p_price_max IS NULL OR p.final_price <= p_price_max)
            AND (v_country_ints IS NULL OR p.origin_country_id = ANY(v_country_ints))
            AND (v_material_ints IS NULL OR p.material_id = ANY(v_material_ints))
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
            AND (p_piece_count_min IS NULL OR p.piece_count >= p_piece_count_min)
            AND (p_piece_count_max IS NULL OR p.piece_count <= p_piece_count_max)
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
        ORDER BY sort_order
        LIMIT p_page_size
        OFFSET v_offset
    )
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
        fp.brand_name, fp.brand_slug, fp.sort_order
    ORDER BY fp.sort_order;
END;
$$;

COMMENT ON FUNCTION public.get_filtered_products(
    TEXT, UUID[], TEXT[], NUMERIC, NUMERIC, TEXT, INT, INT,
    public.attribute_filter[], TEXT[], TEXT[], TEXT[], INT, INT, public.numeric_attribute_filter[]
) IS
'Каталог товаров. Использует generated column final_price вместо вычисления на лету.';


-- ============================================================================
-- 4. Обновляем get_category_price_range — используем final_price
-- ============================================================================

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT oid::regprocedure as func_signature
        FROM pg_proc
        WHERE proname = 'get_category_price_range'
          AND pronamespace = 'public'::regnamespace
    LOOP
        EXECUTE format('DROP FUNCTION %s CASCADE', r.func_signature);
    END LOOP;
END $$;

CREATE FUNCTION public.get_category_price_range(
    p_category_slug TEXT
)
RETURNS TABLE (
    min_price NUMERIC,
    max_price NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    category_ids UUID[];
BEGIN
    SELECT array_agg(id)
    INTO category_ids
    FROM public.get_category_and_children_ids(p_category_slug);

    RETURN QUERY
    SELECT
        COALESCE(MIN(p.final_price), 0) AS min_price,
        COALESCE(MAX(p.final_price), 50000) AS max_price
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        AND p.category_id = ANY(category_ids);
END;
$$;

COMMENT ON FUNCTION public.get_category_price_range(TEXT) IS
'Диапазон цен категории. Использует generated column final_price.';


-- ============================================================================
-- 5. Перезагрузка схемы
-- ============================================================================

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
