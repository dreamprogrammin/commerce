-- ============================================================================
-- ДОБАВЛЕНИЕ ФИЛЬТРА ПО КОЛИЧЕСТВУ ДЕТАЛЕЙ В get_filtered_products
-- ============================================================================

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

-- Создаем обновленную версию с фильтром по piece_count
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
            -- 7. Фильтр по динамическим атрибутам
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
            -- 8. Фильтр по количеству деталей
            AND (p_piece_count_min IS NULL OR p.piece_count >= p_piece_count_min)
            AND (p_piece_count_max IS NULL OR p.piece_count <= p_piece_count_max)
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
    TEXT, UUID[], TEXT[], NUMERIC, NUMERIC, TEXT, INT, INT, public.attribute_filter[], TEXT[], TEXT[], TEXT[], INT, INT
) IS
'Возвращает отфильтрованный список товаров с изображениями. Поддерживает фильтр по количеству деталей (piece_count).';

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
