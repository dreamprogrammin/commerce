-- Теперь создаем одну, финальную, правильную версию (ИСПОЛЬЗУЕМ CREATE OR REPLACE)
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
    -- === НОВЫЕ АРГУМЕНТЫ ===
    p_country_ids INTEGER[] DEFAULT NULL,
    p_material_ids INTEGER[] DEFAULT NULL
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
BEGIN
    v_offset := (p_page_number - 1) * p_page_size;

    RETURN QUERY
    SELECT
        p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
        p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
        p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
        (SELECT json_agg(pi) FROM public.product_images pi WHERE pi.product_id = p.id) AS product_images,
        b.name AS brand_name,
        b.slug AS brand_slug
    FROM
        public.products p
    LEFT JOIN
        public.brands b ON p.brand_id = b.id
    WHERE
        p.is_active = TRUE
        AND (
            (p_subcategory_ids IS NOT NULL AND CARDINALITY(p_subcategory_ids) > 0 AND p.category_id = ANY(p_subcategory_ids))
            OR
            (
                (p_subcategory_ids IS NULL OR CARDINALITY(p_subcategory_ids) = 0)
                AND
                (
                    p_category_slug = 'all'
                    OR
                    p.category_id = ANY(ARRAY(SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) cat))
                )
            )
        )
        AND (p_brand_ids IS NULL OR CARDINALITY(p_brand_ids) = 0 OR p.brand_id = ANY(p_brand_ids))
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
        
        -- === НОВЫЙ ФИЛЬТР: Страна происхождения ===
        AND (p_country_ids IS NULL OR CARDINALITY(p_country_ids) = 0 OR p.origin_country_id = ANY(p_country_ids))
        
        -- === НОВЫЙ ФИЛЬТР: Материал ===
        AND (p_material_ids IS NULL OR CARDINALITY(p_material_ids) = 0 OR p.material_id = ANY(p_material_ids))
        
        -- Существующая логика фильтрации по динамическим атрибутам
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
        p.name ASC -- Без запятой!
    LIMIT p_page_size
    OFFSET v_offset;
END;
$$