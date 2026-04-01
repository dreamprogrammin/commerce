-- Add final_price to get_personalized_recommendations RPC function
-- Date: 2026-04-01

-- Drop the old function first (PostgreSQL doesn't allow changing return type)
DROP FUNCTION IF EXISTS public.get_personalized_recommendations(uuid, integer);

-- Create new function with final_price
CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(p_user_id uuid, p_limit integer DEFAULT 10)
RETURNS TABLE (
    id UUID, 
    name TEXT, 
    slug TEXT, 
    description TEXT, 
    price NUMERIC,
    final_price NUMERIC,  -- 🔥 ДОБАВЛЕНО
    category_id UUID, 
    bonus_points_award INT, 
    stock_quantity INT,
    sales_count INT, 
    is_active BOOLEAN, 
    min_age_years INT, 
    max_age_years INT,
    gender TEXT, 
    accessory_ids UUID[], 
    is_accessory BOOLEAN, 
    barcode TEXT,
    brand_id UUID, 
    origin_country_id INT, 
    material_id INT, 
    discount_percentage NUMERIC,
    created_at TIMESTAMPTZ, 
    updated_at TIMESTAMPTZ,
    product_images JSON
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    -- Сценарий 1: У пользователя есть дети
    IF EXISTS (SELECT 1 FROM public.children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.description, p.price, 
          p.final_price,  -- 🔥 ДОБАВЛЕНО
          p.category_id, p.bonus_points_award, p.stock_quantity,
          p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
          p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id, 'product_id', pi.product_id, 'image_url', pi.image_url,
                'alt_text', pi.alt_text, 'display_order', pi.display_order,
                'blur_placeholder', pi.blur_placeholder, 'created_at', pi.created_at
              ) ORDER BY pi.display_order
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
          ) as product_images
        FROM public.products p
        LEFT JOIN public.product_images pi ON pi.product_id = p.id
        WHERE
            p.is_active = TRUE
            AND EXISTS (
                SELECT 1 FROM public.children c
                WHERE c.user_id = p_user_id
                AND EXTRACT(YEAR FROM age(c.birth_date)) >= COALESCE(p.min_age_years, 0)
                AND EXTRACT(YEAR FROM age(c.birth_date)) <= COALESCE(p.max_age_years, 99)
                AND (p.gender = 'unisex' OR p.gender IS NULL OR p.gender = c.gender)
            )
        GROUP BY p.id, p.name, p.slug, p.description, p.price, p.final_price, p.category_id, p.bonus_points_award, p.stock_quantity,
                 p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
                 p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
        ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 2: Нет детей, но есть история просмотров
    IF EXISTS (SELECT 1 FROM public.product_views WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.description, p.price,
          p.final_price,  -- 🔥 ДОБАВЛЕНО
          p.category_id, p.bonus_points_award, p.stock_quantity,
          p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
          p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', pi.id, 'product_id', pi.product_id, 'image_url', pi.image_url,
                'alt_text', pi.alt_text, 'display_order', pi.display_order,
                'blur_placeholder', pi.blur_placeholder, 'created_at', pi.created_at
              ) ORDER BY pi.display_order
            ) FILTER (WHERE pi.id IS NOT NULL),
            '[]'::json
          ) as product_images
        FROM public.products p
        LEFT JOIN public.product_images pi ON pi.product_id = p.id
        WHERE
            p.is_active = TRUE
            AND p.category_id IN (
                SELECT DISTINCT pr.category_id
                FROM public.product_views pv
                JOIN public.products pr ON pr.id = pv.product_id
                WHERE pv.user_id = p_user_id
                AND pr.category_id IS NOT NULL
            )
            AND p.id NOT IN (
                SELECT product_id FROM public.product_views WHERE user_id = p_user_id
            )
        GROUP BY p.id, p.name, p.slug, p.description, p.price, p.final_price, p.category_id, p.bonus_points_award, p.stock_quantity,
                 p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
                 p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
        ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 3: Fallback - популярные товары
    RETURN QUERY
    SELECT
      p.id, p.name, p.slug, p.description, p.price,
      p.final_price,  -- 🔥 ДОБАВЛЕНО
      p.category_id, p.bonus_points_award, p.stock_quantity,
      p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
      p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at,
      COALESCE(
        json_agg(
          json_build_object(
            'id', pi.id, 'product_id', pi.product_id, 'image_url', pi.image_url,
            'alt_text', pi.alt_text, 'display_order', pi.display_order,
            'blur_placeholder', pi.blur_placeholder, 'created_at', pi.created_at
          ) ORDER BY pi.display_order
        ) FILTER (WHERE pi.id IS NOT NULL),
        '[]'::json
      ) as product_images
    FROM public.products p
    LEFT JOIN public.product_images pi ON pi.product_id = p.id
    WHERE p.is_active = TRUE
    GROUP BY p.id, p.name, p.slug, p.description, p.price, p.final_price, p.category_id, p.bonus_points_award, p.stock_quantity,
             p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
             p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
    ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_personalized_recommendations IS 'Returns personalized product recommendations with final_price (psychological rounding applied)';
