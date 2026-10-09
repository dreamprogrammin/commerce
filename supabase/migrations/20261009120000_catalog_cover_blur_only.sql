-- =====================================================================================
-- get_filtered_products: размытое превью только у первой картинки товара
-- =====================================================================================
-- 9 октября 2026. Supabase: тариф Free, Egress 5,98 из 5 ГБ (120%), с 6 ноября проект
-- ограничат, если превышение повторится. Почти весь Egress — серверные пересборки
-- страниц, и тяжелее всего в них эта функция: на 24 товара ответ 107,5 КБ сжатыми, из
-- них 91 КБ — `product_images`, где у КАЖДОЙ картинки (~5 на товар) лежит
-- `blur_placeholder` ~1,8 КБ (base64, почти не сжимается). Плитке превью нужно только
-- для первой картинки, пока она грузится; остальные слайды подгружаются при
-- пролистывании, и превью у них заменяет пустой фон.
--
-- Что меняется: у картинок со второй `blur_placeholder` = NULL. Порядок — по
-- `display_order`, при равенстве — по `id` (раньше при равенстве был случайным).
-- Сигнатура, столбцы результата и права — прежние (CREATE OR REPLACE их сохраняет),
-- фронт к правке готов в любом порядке выкатки: ProgressiveImage без превью рисует
-- обычную заглушку.
--
-- Тело снято с прода через pg_get_functiondef 9 октября 2026 (md5 ниже) — правило 7.
-- =====================================================================================

-- ── 1. Проверка состояния: ровно одна версия функции и ровно то тело, что снято с прода
DO $check$
DECLARE
  v_count int;
  v_md5 text;
BEGIN
  SELECT count(*), max(md5(pg_get_functiondef(p.oid)))
    INTO v_count, v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_filtered_products';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'get_filtered_products: ожидалась одна версия, найдено %', v_count;
  END IF;
  IF v_md5 IS DISTINCT FROM '349ecf56b19ca0f864509ad64e11e447' THEN
    RAISE EXCEPTION 'get_filtered_products: тело не то, с которого снята правка (md5 %)', v_md5;
  END IF;
END
$check$;

-- ── 2. Функция — тело с прода, правка только в сборке `product_images`
CREATE OR REPLACE FUNCTION public.get_filtered_products(p_category_slug text, p_subcategory_ids uuid[] DEFAULT NULL::uuid[], p_brand_ids text[] DEFAULT NULL::text[], p_price_min numeric DEFAULT NULL::numeric, p_price_max numeric DEFAULT NULL::numeric, p_sort_by text DEFAULT 'popularity'::text, p_page_number integer DEFAULT 1, p_page_size integer DEFAULT 12, p_attributes attribute_filter[] DEFAULT NULL::attribute_filter[], p_country_ids text[] DEFAULT NULL::text[], p_material_ids text[] DEFAULT NULL::text[], p_product_line_ids text[] DEFAULT NULL::text[], p_piece_count_min integer DEFAULT NULL::integer, p_piece_count_max integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, name text, slug text, description text, price numeric, category_id uuid, bonus_points_award integer, stock_quantity integer, sales_count integer, is_active boolean, min_age_years integer, max_age_years integer, gender text, accessory_ids uuid[], is_accessory boolean, barcode text, brand_id uuid, origin_country_id integer, material_id integer, discount_percentage numeric, created_at timestamp with time zone, updated_at timestamp with time zone, final_price numeric, avg_rating numeric, review_count integer, product_images json, brand_name text, brand_slug text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
                        -- Размытое превью — только у первой картинки (9.10.2026, Egress)
                        'blur_placeholder', CASE WHEN pi.rn = 1 THEN pi.blur_placeholder END
                    )
                    ORDER BY pi.display_order ASC, pi.id
                )
                FROM (
                    SELECT x.*, row_number() OVER (ORDER BY x.display_order ASC, x.id) AS rn
                    FROM public.product_images x
                    WHERE x.product_id = fp.id
                ) pi
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
$function$;

-- ── 3. Проверка результата
DO $verify$
DECLARE
  v_count int;
BEGIN
  SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_filtered_products'
     AND pg_get_functiondef(p.oid) LIKE '%CASE WHEN pi.rn = 1 THEN pi.blur_placeholder END%';
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'get_filtered_products: правка не легла (версий с правкой: %)', v_count;
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';
