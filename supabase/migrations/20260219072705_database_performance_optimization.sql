-- ============================================================================
-- ОПТИМИЗАЦИЯ ПРОИЗВОДИТЕЛЬНОСТИ БАЗЫ ДАННЫХ
-- ============================================================================
-- Дата: 2026-02-19
-- Описание: Комплексная оптимизация индексов, функций и запросов
-- ============================================================================

-- ============================================================================
-- 1. ИНДЕКСЫ
-- ============================================================================

-- 1.1 [HIGH] Индекс для рекурсивного обхода дерева категорий
-- Влияет на: get_filtered_products, get_brands_by_category_slug,
--            get_category_price_range, get_attributes_for_category_slug
CREATE INDEX IF NOT EXISTS idx_categories_parent_id
ON public.categories (parent_id);

-- 1.2 [HIGH] Составные индексы для каталога (filter + sort)
CREATE INDEX IF NOT EXISTS idx_products_active_category_popularity
ON public.products (category_id, sales_count DESC, created_at DESC)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_active_category_price_asc
ON public.products (category_id, price ASC, name ASC)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_active_category_price_desc
ON public.products (category_id, price DESC, name ASC)
WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_products_active_category_newest
ON public.products (category_id, created_at DESC)
WHERE is_active = TRUE;

-- 1.3 [MEDIUM] Индекс для фильтрации по брендам
CREATE INDEX IF NOT EXISTS idx_products_brand_id
ON public.products (brand_id)
WHERE brand_id IS NOT NULL;

-- 1.4 [MEDIUM] Индекс для фильтрации по стране
CREATE INDEX IF NOT EXISTS idx_products_origin_country
ON public.products (origin_country_id)
WHERE origin_country_id IS NOT NULL;

-- 1.5 [MEDIUM] Индекс для фильтрации по материалу
CREATE INDEX IF NOT EXISTS idx_products_material
ON public.products (material_id)
WHERE material_id IS NOT NULL;

-- 1.6 [MEDIUM] Индекс для фильтрации атрибутов по product + option
CREATE INDEX IF NOT EXISTS idx_pav_product_option
ON public.product_attribute_values (product_id, option_id);

-- 1.7 [LOW] Индекс для фильтрации заказов по статусу
CREATE INDEX IF NOT EXISTS idx_orders_status
ON public.orders (status);

-- 1.8 [MEDIUM] Исправление устаревшего индекса на age range (колонки переименованы)
DROP INDEX IF EXISTS idx_products_age_range;

CREATE INDEX IF NOT EXISTS idx_products_age_range_years
ON public.products (min_age_years, max_age_years)
WHERE min_age_years IS NOT NULL;


-- ============================================================================
-- 2. ФУНКЦИИ — добавление STABLE и оптимизация
-- ============================================================================

-- 2.1 [HIGH] is_admin() — добавляем STABLE чтобы кешировать результат в рамках запроса
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;

-- 2.2 [MEDIUM] get_category_and_children_ids() — добавляем STABLE
CREATE OR REPLACE FUNCTION public.get_category_and_children_ids(p_category_slug TEXT)
RETURNS TABLE(id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE category_tree AS (
    SELECT c.id
    FROM public.categories c
    WHERE c.slug = p_category_slug
    UNION ALL
    SELECT c.id
    FROM public.categories c
    JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT tree.id FROM category_tree tree;
$$;

-- 2.3 [MEDIUM] get_category_and_children_ids_by_uuid() — добавляем STABLE
CREATE OR REPLACE FUNCTION public.get_category_and_children_ids_by_uuid(p_category_id UUID)
RETURNS TABLE(id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH RECURSIVE category_tree AS (
    SELECT c.id
    FROM public.categories c
    WHERE c.id = p_category_id
    UNION ALL
    SELECT c.id
    FROM public.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT category_tree.id
  FROM category_tree;
$$;

-- 2.4 [LOW] get_category_price_range() — добавляем STABLE
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
        COALESCE(MIN(p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100), 0) AS min_price,
        COALESCE(MAX(p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100), 50000) AS max_price
    FROM
        public.products p
    WHERE
        p.is_active = TRUE
        AND p.category_id = ANY(category_ids);
END;
$$;


-- ============================================================================
-- 3. ОПТИМИЗАЦИЯ get_filtered_products — pre-cast параметров + row_number
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
    -- Pre-cast параметров для избежания повторного каста на каждой строке
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

    -- Раскрытие подкатегорий
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
            (p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100) AS effective_price,
            ROW_NUMBER() OVER (
                ORDER BY
                    CASE p_sort_by WHEN 'popularity' THEN p.sales_count END DESC NULLS LAST,
                    CASE p_sort_by WHEN 'newest' THEN p.created_at END DESC NULLS LAST,
                    CASE p_sort_by WHEN 'price_asc' THEN (p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100) END ASC NULLS LAST,
                    CASE p_sort_by WHEN 'price_desc' THEN (p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100) END DESC NULLS LAST,
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
            -- Используем pre-cast переменные вместо inline cast
            AND (v_brand_uuids IS NULL OR p.brand_id = ANY(v_brand_uuids))
            AND (v_product_line_uuids IS NULL OR p.product_line_id = ANY(v_product_line_uuids))
            AND (p_price_min IS NULL OR (p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100) >= p_price_min)
            AND (p_price_max IS NULL OR (p.price * (100 - COALESCE(p.discount_percentage, 0)) / 100) <= p_price_max)
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
'Возвращает отфильтрованный список товаров. Оптимизация: STABLE, pre-cast параметров, row_number вместо двойной сортировки.';


-- ============================================================================
-- 4. ОПТИМИЗАЦИЯ get_personalized_recommendations — убираем N+1 подзапросы
-- ============================================================================

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
STABLE
AS $$
BEGIN
    -- Сценарий 1: У пользователя есть дети
    IF EXISTS (SELECT 1 FROM public.children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
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
        GROUP BY p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
                 p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
                 p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
        ORDER BY p.sales_count DESC NULLS LAST, RANDOM()
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 2: Детей нет, но есть покупки
    IF EXISTS (SELECT 1 FROM public.orders WHERE user_id = p_user_id) THEN
        RETURN QUERY
        WITH last_purchased_category AS (
            SELECT p_inner.category_id AS last_category_id
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
        CROSS JOIN last_purchased_category lpc
        WHERE p.is_active = TRUE
          AND p.category_id = lpc.last_category_id
          AND p.id NOT IN (
              SELECT oi.product_id
              FROM public.orders o
              JOIN public.order_items oi ON o.id = oi.order_id
              WHERE o.user_id = p_user_id
          )
        GROUP BY p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
                 p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
                 p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
        ORDER BY p.sales_count DESC NULLS LAST
        LIMIT p_limit;

        IF FOUND THEN
            RETURN;
        END IF;
    END IF;

    -- Сценарий 3: Пользователь новый — популярные товары
    RETURN QUERY
    SELECT
      p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
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
    GROUP BY p.id, p.name, p.slug, p.description, p.price, p.category_id, p.bonus_points_award, p.stock_quantity,
             p.sales_count, p.is_active, p.min_age_years, p.max_age_years, p.gender, p.accessory_ids, p.is_accessory,
             p.barcode, p.brand_id, p.origin_country_id, p.material_id, p.discount_percentage, p.created_at, p.updated_at
    ORDER BY p.sales_count DESC NULLS LAST
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.get_personalized_recommendations(UUID, INTEGER) IS
'Персонализированные рекомендации. Оптимизация: STABLE, LEFT JOIN вместо N+1 подзапросов для картинок.';


-- ============================================================================
-- 5. ОПТИМИЗАЦИЯ create_guest_checkout — убираем двойной запрос товаров
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT);

CREATE FUNCTION public.create_guest_checkout(
  p_cart_items JSONB,
  p_guest_info JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_checkout_id UUID;
  v_total_price NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
  v_item_final_price NUMERIC;
  -- Кеш валидированных товаров для однократного запроса
  v_validated_items JSONB := '[]'::JSONB;
BEGIN
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  -- Один проход: валидация + расчёт цен + кеширование
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT
      price,
      COALESCE(discount_percentage, 0) as discount_percentage,
      stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_item_final_price := v_product_record.price * (100 - v_product_record.discount_percentage) / 100;
    v_total_price := v_total_price + (v_item_final_price * v_cart_item.quantity);

    -- Кешируем для второго прохода
    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_cart_item.product_id,
      'quantity', v_cart_item.quantity,
      'final_price', v_item_final_price
    );
  END LOOP;

  INSERT INTO public.guest_checkouts (
    guest_name, guest_email, guest_phone,
    total_amount, final_amount, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone',
    v_total_price, v_total_price, p_delivery_method, p_delivery_address, p_payment_method, 'new'
  )
  RETURNING id INTO v_new_checkout_id;

  -- Вставка из кеша — без повторного запроса к products
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(v_validated_items) AS x(product_id UUID, quantity INTEGER, final_price NUMERIC) LOOP
    INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
    VALUES (
      v_new_checkout_id,
      v_cart_item.product_id,
      v_cart_item.quantity,
      v_cart_item.final_price
    );
  END LOOP;

  RETURN v_new_checkout_id;
END;
$$;

COMMENT ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT) IS
'Гостевой заказ. Оптимизация: один запрос к products вместо двух.';


-- ============================================================================
-- 6. ОПТИМИЗАЦИЯ create_user_order — убираем двойной запрос товаров
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER);

CREATE OR REPLACE FUNCTION public.create_user_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_address JSONB DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_profile RECORD;
  v_new_order_id UUID;
  v_total_price NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
  v_bonus_rate NUMERIC := 1.0;
  v_is_first_order BOOLEAN;
  v_new_active_balance INTEGER;
  v_user_email TEXT;
  v_user_name TEXT;
  v_item_final_price NUMERIC;
  -- Кеш валидированных товаров
  v_validated_items JSONB := '[]'::JSONB;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  -- Auto-create profile if missing
  IF v_user_profile IS NULL THEN
    SELECT email,
           COALESCE(
             raw_user_meta_data->>'first_name',
             raw_user_meta_data->>'full_name',
             raw_user_meta_data->>'name',
             split_part(email, '@', 1),
             'Гость'
           )
    INTO v_user_email, v_user_name
    FROM auth.users
    WHERE id = v_current_user_id;

    INSERT INTO public.profiles (
      id, first_name, role,
      active_bonus_balance, pending_bonus_balance, has_received_welcome_bonus
    )
    VALUES (
      v_current_user_id, v_user_name, 'user', 0, 0, FALSE
    )
    ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

    IF v_user_profile IS NULL THEN
      RAISE EXCEPTION 'Не удалось создать профиль. Email: %, User ID: %', v_user_email, v_current_user_id;
    END IF;
  END IF;

  SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = v_current_user_id) INTO v_is_first_order;

  -- Один проход: валидация + расчёт + кеширование
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT
      price,
      COALESCE(discount_percentage, 0) as discount_percentage,
      bonus_points_award,
      stock_quantity
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_item_final_price := v_product_record.price * (100 - v_product_record.discount_percentage) / 100;
    v_total_price := v_total_price + (v_item_final_price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (COALESCE(v_product_record.bonus_points_award, 0) * v_cart_item.quantity);

    -- Кешируем
    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_cart_item.product_id,
      'quantity', v_cart_item.quantity,
      'final_price', v_item_final_price,
      'bonus_points', COALESCE(v_product_record.bonus_points_award, 0)
    );
  END LOOP;

  -- Apply bonuses
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    IF COALESCE(v_user_profile.active_bonus_balance, 0) < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
        COALESCE(v_user_profile.active_bonus_balance, 0), p_bonuses_to_spend;
    END IF;

    v_calculated_discount := COALESCE(p_bonuses_to_spend, 0) * v_bonus_rate;
  END IF;

  v_final_price := GREATEST(COALESCE(v_total_price, 0) - COALESCE(v_calculated_discount, 0), 0);

  INSERT INTO public.orders (
    user_id, total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    v_current_user_id,
    COALESCE(v_total_price, 0),
    COALESCE(v_calculated_discount, 0),
    COALESCE(v_final_price, 0),
    COALESCE(p_bonuses_to_spend, 0),
    COALESCE(v_total_award_bonuses, 0),
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new'
  )
  RETURNING id INTO v_new_order_id;

  -- Вставка из кеша — без повторного запроса к products
  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(v_validated_items) AS x(product_id UUID, quantity INTEGER, final_price NUMERIC, bonus_points INTEGER) LOOP
    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (
      v_new_order_id,
      v_cart_item.product_id,
      v_cart_item.quantity,
      v_cart_item.final_price,
      v_cart_item.bonus_points
    );
  END LOOP;

  -- Deduct spent bonuses
  IF COALESCE(p_bonuses_to_spend, 0) > 0 THEN
    v_new_active_balance := GREATEST(COALESCE(v_user_profile.active_bonus_balance, 0) - p_bonuses_to_spend, 0);

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active_balance
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (
      user_id, order_id, amount, transaction_type, status, description
    ) VALUES (
      v_current_user_id,
      v_new_order_id,
      -p_bonuses_to_spend,
      'spent',
      'completed',
      'Списание бонусов при оформлении заказа'
    );
  END IF;

  RETURN v_new_order_id;
END;
$$;

COMMENT ON FUNCTION public.create_user_order IS
'Заказ для авторизованного пользователя. Оптимизация: один запрос к products вместо двух.';


-- ============================================================================
-- 7. ПЕРЕЗАГРУЗКА СХЕМЫ
-- ============================================================================

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
