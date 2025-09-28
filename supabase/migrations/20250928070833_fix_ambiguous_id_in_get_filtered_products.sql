-- Удаляем все возможные старые версии функции, чтобы избежать конфликтов.
DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, INT, INT, NUMERIC, NUMERIC, TEXT, UUID[]);
DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, UUID[], NUMERIC, NUMERIC, TEXT, INT, INT);
DROP FUNCTION IF EXISTS public.get_filtered_products(TEXT, INT, INT, NUMERIC, NUMERIC, TEXT, _UUID);

-- Создаем одну-единственную, правильную версию функции.
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_page_number INT DEFAULT 1,
    p_page_size INT DEFAULT 12,
    p_price_max NUMERIC DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_subcategory_ids UUID[] DEFAULT NULL
)
RETURNS TABLE(
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC,
    category_id UUID, bonus_points_award INT4, stock_quantity INT4, sales_count INT4,
    is_active BOOLEAN, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    min_age INT4, max_age INT4, gender TEXT, accessory_ids UUID[], is_accessory BOOLEAN,
    product_images JSON[]
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_category_ids UUID[];
BEGIN
    IF p_category_slug IS NOT NULL AND p_category_slug <> 'all' THEN
        WITH RECURSIVE category_tree AS (
            SELECT cat.id FROM public.categories cat WHERE cat.slug = p_category_slug
            UNION ALL
            SELECT c.id FROM public.categories c JOIN category_tree ct ON c.parent_id = ct.id
        )
        SELECT array_agg(tree.id) INTO v_category_ids FROM category_tree tree;
    END IF;

    RETURN QUERY
    SELECT
        p.id, p.name, p.slug, p.description, p.price, p.category_id,
        p.bonus_points_award, p.stock_quantity, p.sales_count, p.is_active,
        p.created_at, p.updated_at, p.min_age, p.max_age, p.gender,
        p.accessory_ids, p.is_accessory,
        (
            SELECT array_agg(json_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order))
            FROM public.product_images pi
            WHERE pi.product_id = p.id
        ) AS product_images
    FROM
        public.products p
    WHERE
        p.is_active = true
        AND (v_category_ids IS NULL OR p.category_id = ANY(v_category_ids))
        AND (p_subcategory_ids IS NULL OR array_length(p_subcategory_ids, 1) IS NULL OR p.category_id = ANY(p_subcategory_ids))
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
    ORDER BY
        CASE WHEN p_sort_by = 'popularity' THEN p.sales_count END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'newest' THEN p.created_at END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'price_asc' THEN p.price END ASC NULLS LAST,
        CASE WHEN p_sort_by = 'price_desc' THEN p.price END DESC NULLS LAST
    LIMIT p_page_size
    OFFSET (p_page_number - 1) * p_page_size;
END;
$$;