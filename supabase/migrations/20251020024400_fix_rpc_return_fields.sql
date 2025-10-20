-- Up Migration: Исправляем возвращаемые поля в RPC-функции

-- 1. Сначала БЕЗУСЛОВНО УДАЛЯЕМ старую версию функции, если она существует.
--    Это позволяет нам полностью переопределить ее ниже.
DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, UUID[], UUID[], NUMERIC, NUMERIC, TEXT, INT, INT, public.attribute_filter[]);

CREATE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[],
    p_brand_ids UUID[],
    p_price_min NUMERIC,
    p_price_max NUMERIC,
    p_sort_by TEXT,
    p_page_number INT,
    p_page_size INT,
    p_attributes public.attribute_filter[] DEFAULT NULL
)
RETURNS TABLE (
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC, 
    category_id UUID, bonus_points_award INT, stock_quantity INT, 
    sales_count INT, is_active BOOLEAN, min_age_years INT, max_age_years INT, 
    gender TEXT, accessory_ids UUID[], is_accessory BOOLEAN, barcode TEXT, 
    brand_id UUID, origin_country_id INT, material_id INT, discount_percentage NUMERIC,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, 
    product_images JSON[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_category_ids UUID[];
    v_offset INT;
BEGIN
    -- Определяем, по каким категориям искать
    IF p_category_slug = 'all' THEN
        SELECT ARRAY_AGG(c.id) INTO v_category_ids FROM public.categories c WHERE c.is_root_category = false;
    ELSE
        SELECT ARRAY_AGG(cat.id) INTO v_category_ids FROM public.get_category_and_children_ids(p_category_slug) cat;
    END IF;

    -- Рассчитываем сдвиг для пагинации
    v_offset := (p_page_number - 1) * p_page_size;

    -- Основной запрос
    RETURN QUERY
    SELECT
        p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
        p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
        p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
        ARRAY_AGG(
            JSON_BUILD_OBJECT('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order, 'alt_text', pi.alt_text)
        ) FILTER (WHERE pi.id IS NOT NULL) AS product_images
    FROM
        public.products p
    LEFT JOIN
        public.product_images pi ON p.id = pi.product_id
    WHERE
        p.is_active = TRUE
        AND (
            (p_subcategory_ids IS NULL OR CARDINALITY(p_subcategory_ids) = 0 AND p.category_id = ANY(v_category_ids))
            OR
            (p_subcategory_ids IS NOT NULL AND p.category_id = ANY(p_subcategory_ids))
        )
        AND (p_brand_ids IS NULL OR CARDINALITY(p_brand_ids) = 0 OR p.brand_id = ANY(p_brand_ids))
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
        AND (
            p_attributes IS NULL OR
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
    ORDER BY
        CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC,
        CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC,
        CASE WHEN p_sort_by = 'price_asc' THEN p.price END ASC,
        CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC
    LIMIT p_page_size
    OFFSET v_offset;

END;
$$;


/*
-- Down Migration (Закомментировано)

DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, UUID[], UUID[], NUMERIC, NUMERIC, TEXT, INT, INT, public.attribute_filter[]);

*/