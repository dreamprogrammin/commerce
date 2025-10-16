DROP FUNCTION IF EXISTS public.get_filtered_products; -- Удаляем старую версию

CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_brand_ids UUID[] DEFAULT NULL,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity',
    p_page_number INT DEFAULT 1,
    p_page_size INT DEFAULT 10
)
RETURNS TABLE (
    -- Убедитесь, что здесь все ваши колонки. Это примерный набор.
    id UUID,
    name TEXT,
    slug TEXT,
    price NUMERIC,
    sales_count INT,
    created_at TIMESTAMPTZ,
    product_images JSONB[]
) AS $$
DECLARE
    v_category_ids UUID[];
BEGIN
    -- Получаем ID всех дочерних категорий, если указан родительский слаг
    IF p_category_slug IS NOT NULL AND p_category_slug <> 'all' THEN
        SELECT ARRAY(
            SELECT cat.id FROM public.get_category_and_children_ids(p_category_slug) cat
        ) INTO v_category_ids;
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.name,
        p.slug,
        p.price,
        p.sales_count,
        p.created_at,
        ARRAY(
            SELECT jsonb_build_object('id', pi.id, 'image_url', pi.image_url)
            FROM public.product_images pi
            WHERE pi.product_id = p.id
            ORDER BY pi.display_order
        ) AS product_images
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        -- Фильтр по категории (родительской и дочерним)
        AND (v_category_ids IS NULL OR p.category_id = ANY(v_category_ids))
        -- Фильтр по подкатегориям (если передан)
        AND (p_subcategory_ids IS NULL OR p.category_id = ANY(p_subcategory_ids))
        -- Фильтр по брендам
        AND (p_brand_ids IS NULL OR p.brand_id = ANY(p_brand_ids))
        -- Фильтр по цене
        AND (p_price_min IS NULL OR p.price >= p_price_min)
        AND (p_price_max IS NULL OR p.price <= p_price_max)
    
    -- ==== ИСПРАВЛЕННЫЙ БЛОК ORDER BY ====
    ORDER BY
        CASE 
            WHEN p_sort_by = 'popularity' THEN p.sales_count 
            ELSE NULL 
        END DESC,
        CASE 
            WHEN p_sort_by = 'newest' THEN p.created_at 
            ELSE NULL 
        END DESC,
        CASE 
            WHEN p_sort_by = 'price_asc' THEN p.price 
            ELSE NULL 
        END ASC,
        CASE 
            WHEN p_sort_by = 'price_desc' THEN p.price 
            ELSE NULL 
        END DESC
    -- ===================================

    -- Пагинация
    LIMIT p_page_size
    OFFSET (p_page_number - 1) * p_page_size;
END;
$$ LANGUAGE plpgsql;


/*
-- Down Migration (закомментировано)
-- Здесь нужно будет вставить код вашей предыдущей версии функции
*/