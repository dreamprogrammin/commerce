-- Up Migration: Финальное ИСПРАВЛЕНИЕ функции get_personalized_recommendations

DROP FUNCTION IF EXISTS public.get_personalized_recommendations(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(p_user_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC, 
    category_id UUID, bonus_points_award INT, stock_quantity INT, 
    sales_count INT, is_active BOOLEAN, min_age_years INT, max_age_years INT, 
    gender TEXT, accessory_ids UUID[], is_accessory BOOLEAN, barcode TEXT, 
    brand_id UUID, origin_country_id INT, material_id INT, discount_percentage NUMERIC,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, 
    product_images JSON
)
LANGUAGE plpgsql
AS $$
BEGIN
    -- Сценарий 1: У пользователя есть дети
    IF EXISTS (SELECT 1 FROM public.children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
          p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
          p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
          (SELECT json_agg(pi) FROM public.product_images pi WHERE pi.product_id = p.id) as product_images
        FROM public.products p
        WHERE
            p.is_active = TRUE
            AND EXISTS (
                SELECT 1 FROM public.children c
                WHERE c.user_id = p_user_id
                AND EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)) BETWEEN p.min_age_years AND p.max_age_years
                AND (p.gender = 'unisex' OR p.gender = c.gender)
            )
        ORDER BY p.sales_count DESC NULLS LAST, RANDOM() 
        LIMIT p_limit;
        RETURN;
    END IF;

    -- Сценарий 2: Детей нет, но есть покупки
    IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = p_user_id) THEN
        RETURN QUERY
        WITH last_purchased_category AS (
            SELECT p_inner.category_id
            FROM public.orders o
            JOIN public.order_items oi ON o.id = oi.order_id
            JOIN public.products p_inner ON oi.product_id = p_inner.id
            WHERE o.user_id = p_user_id AND p_inner.category_id IS NOT NULL
            ORDER BY o.created_at DESC LIMIT 1
        )
        SELECT
            p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
            p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
            p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
            (SELECT json_agg(pi) FROM public.product_images pi WHERE pi.product_id = p.id) as product_images
        FROM public.products p
        WHERE p.is_active = TRUE 
          AND p.category_id = (SELECT category_id FROM last_purchased_category)
          AND p.id NOT IN (SELECT oi.product_id FROM public.orders o JOIN public.order_items oi ON o.id = oi.order_id WHERE o.user_id = p_user_id)
        ORDER BY p.sales_count DESC NULLS LAST
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 3: Пользователь новый
    RETURN QUERY
    SELECT
      p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
      p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
      p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
      (SELECT json_agg(pi) FROM public.product_images pi WHERE pi.product_id = p.id) as product_images
    FROM public.products p
    WHERE p.is_active = TRUE
    ORDER BY p.sales_count DESC NULLS LAST
    LIMIT p_limit;
    
END;
$$;


/*
-- Down Migration (Закомментировано)
*/