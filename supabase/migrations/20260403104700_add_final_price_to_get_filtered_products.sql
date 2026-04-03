-- ============================================================================
-- ДОБАВЛЕНИЕ final_price В get_filtered_products
-- ============================================================================
-- Проблема: RPC функция get_filtered_products() не возвращает поле final_price,
-- из-за чего на фронте показывается одинаковая цена (price вместо final_price)
-- 
-- Решение: Добавить final_price в RETURNS TABLE и в SELECT запрос
-- 
-- Дата: 2026-04-03

-- Удаляем все версии функции get_filtered_products
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

-- Создаем обновленную версию с полем final_price
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
    p_piece_count_max INT DEFAULT NULL
)
RETURNS TABLE (
    -- Все поля из `products`
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC,
    category_id UUID, bonus_points_award INT, stock_quantity INT,
    sales_count INT, is_active BOOLEAN, min_age_years INT, max_age_years INT,
    gender TEXT, accessory_ids UUID[], is_accessory BOOLEAN, barcode TEXT,
    brand_id UUID, origin_country_id INT, material_id INT, discount_percentage NUMERIC,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    -- ⭐ ДОБАВЛЕНО: final_price (цена со скидкой с психологическим округлением)
    final_price NUMERIC,
    -- Рейтинг и отзывы
    avg_rating NUMERIC,
    review_count INT,
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
            -- ⭐ ДОБАВЛЕНО: final_price (generated column с психологическим округлением)
            p.final_price,
            -- Рейтинг и отзывы
            p.avg_rating,
            p.review_count,
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
                -- Если подкатегории не выбраны, используем основную категорию (с дочерними)
                OR (v_subcategory_ids_expanded IS NULL AND (p_category_slug = 'all' OR p.category_id = ANY(v_category_ids)))
            )
            -- 2. Фильтр по брендам
            AND (p_brand_ids IS NULL OR p.brand_id::TEXT = ANY(p_brand_ids))
            -- 3. Фильтр по линейкам продуктов
            AND (p_product_line_ids IS NULL OR p.product_line_id::TEXT = ANY(p_product_line_ids))
            -- 4. Фильтр по цене (используем final_price для учета скидок)
            AND (p_price_min IS NULL OR COALESCE(p.final_price, p.price) >= p_price_min)
            AND (p_price_max IS NULL OR COALESCE(p.final_price, p.price) <= p_price_max)
            -- 5. Фильтр по стране происхождения
            AND (p_country_ids IS NULL OR p.origin_country_id::TEXT = ANY(p_country_ids))
            -- 6. Фильтр по материалу
            AND (p_material_ids IS NULL OR p.material_id::TEXT = ANY(p_material_ids))
            -- 7. Фильтр по количеству деталей (для конструкторов)
            AND (p_piece_count_min IS NULL OR p.piece_count >= p_piece_count_min)
            AND (p_piece_count_max IS NULL OR p.piece_count <= p_piece_count_max)
            -- 8. Фильтр по атрибутам (цвет, размер и т.д.)
            AND (
                p_attributes IS NULL
                OR p.id IN (
                    SELECT pav.product_id
                    FROM public.product_attribute_values pav
                    WHERE (pav.option_id = ANY(
                        SELECT unnest(
                            ARRAY_AGG(attr.option_ids)
                        )
                        FROM unnest(p_attributes) AS attr
                    ))
                    GROUP BY pav.product_id
                    HAVING COUNT(DISTINCT pav.attribute_id) = CARDINALITY(p_attributes)
                )
            )
    )
    SELECT
        fp.id, fp.name, fp.slug, fp.description, fp.price, fp.category_id, fp.bonus_points_award, fp.stock_quantity,
        fp.sales_count, fp.is_active, fp.min_age_years, fp.max_age_years, fp.gender, fp.accessory_ids, fp.is_accessory,
        fp.barcode, fp.brand_id, fp.origin_country_id, fp.material_id, fp.discount_percentage, fp.created_at, fp.updated_at,
        -- ⭐ ДОБАВЛЕНО: final_price
        fp.final_price,
        -- Рейтинг и отзывы
        fp.avg_rating,
        fp.review_count,
        -- Галерея изображений (JSON)
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pi.id,
                        'image_url', pi.image_url,
                        'display_order', pi.display_order,
                        'alt_text', pi.alt_text,
                        'blur_placeholder', pi.blur_placeholder
                    )
                    ORDER BY pi.display_order ASC
                )
                FROM public.product_images pi
                WHERE pi.product_id = fp.id
            ),
            '[]'::json
        ) AS product_images,
        fp.brand_name,
        fp.brand_slug
    FROM
        filtered_products fp
    ORDER BY
        CASE
            WHEN p_sort_by = 'popularity' THEN fp.sales_count
            WHEN p_sort_by = 'newest' THEN EXTRACT(EPOCH FROM fp.created_at)::INT
            ELSE NULL
        END DESC NULLS LAST,
        CASE
            WHEN p_sort_by = 'price_asc' THEN COALESCE(fp.final_price, fp.price)
            ELSE NULL
        END ASC NULLS LAST,
        CASE
            WHEN p_sort_by = 'price_desc' THEN COALESCE(fp.final_price, fp.price)
            ELSE NULL
        END DESC NULLS LAST,
        fp.name ASC
    LIMIT p_page_size
    OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.get_filtered_products IS 'Получение отфильтрованных товаров с поддержкой фильтрации по категориям, брендам, линейкам, ценам, странам, материалам и атрибутам. Возвращает final_price (цена со скидкой с психологическим округлением).';
