-- =====================================================================================
-- ПОИСК: отдаём те же поля, что и каталог
-- =====================================================================================
-- Страница результатов рисовалась своим списком в одну колонку и на десктопе
-- выглядела чужеродно («гигантский результат поиска» — слова владельца).
-- Переводим её на обычную сетку карточек каталога (`ProductGrid`/`ProductCard`),
-- а для этого функции поиска нужно вернуть те же поля, что карточка ждёт:
-- цену со скидкой, бонусы, рейтинг, отметку «новинка».
--
-- Возвращаемый тип меняется, поэтому CREATE OR REPLACE не подходит — только
-- DROP и создание заново (см. п. 10 «Как мы работаем»). Сигнатура прежняя,
-- (text, integer), так что перегрузок не появится.
--
-- ПОРЯДОК: миграция едет ПЕРЕД фронтом. Старый фронт переживёт новые колонки —
-- он их просто не читает.
-- =====================================================================================

-- Проверка состояния: функция должна существовать ровно одна, иначе миграция
-- готовилась не под эту базу.
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'search_products';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'Ожидалась одна версия search_products, найдено %', v_count;
  END IF;
END $$;

DROP FUNCTION public.search_products(TEXT, INTEGER);

CREATE FUNCTION public.search_products(
  p_query TEXT,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  price NUMERIC,
  final_price NUMERIC,
  discount_percentage NUMERIC,
  stock_quantity INTEGER,
  bonus_points_award INTEGER,
  avg_rating NUMERIC,
  review_count INTEGER,
  is_new BOOLEAN,
  category_id UUID,
  brand JSONB,
  images JSONB,
  rank INTEGER
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH query AS (
    SELECT
      public.search_key(p_query) AS whole,
      array_remove(string_to_array(public.search_key(p_query), ' '), '') AS words
  ),
  candidates AS (
    SELECT
      p.id,
      p.name,
      p.slug,
      p.price,
      p.final_price,
      p.discount_percentage,
      p.stock_quantity,
      p.bonus_points_award,
      p.avg_rating,
      p.review_count,
      p.is_new,
      p.category_id,
      p.brand_id,
      p.sales_count,
      public.search_key(p.name) AS name_key,
      public.search_key(coalesce(b.name, '')) AS brand_key,
      public.search_key(
        p.name || ' ' || coalesce(b.name, '') || ' ' || coalesce(p.description, '')
      ) AS full_key
    FROM public.products p
    LEFT JOIN public.brands b ON b.id = p.brand_id
    WHERE p.is_active = true
  ),
  matched AS (
    SELECT
      c.*,
      (SELECT q.whole FROM query q) AS q_whole
    FROM candidates c
    WHERE
      (SELECT cardinality(q.words) FROM query q) > 0
      AND NOT EXISTS (
        SELECT 1
        FROM unnest((SELECT q.words FROM query q)) AS w
        WHERE position(w IN c.full_key) = 0
          AND NOT (
            length(w) >= 5
            AND c.full_key ~ ('(^|[^a-z0-9])' || left(w, greatest(4, length(w) - 2)))
          )
          AND NOT (length(w) >= 5 AND strict_word_similarity(w, c.full_key) >= 0.55)
      )
  )
  SELECT
    m.id,
    m.name,
    m.slug,
    m.price,
    -- У части товаров цена со скидкой в базе не проставлена — считаем сами,
    -- иначе карточка покажет ноль.
    coalesce(
      m.final_price,
      round(m.price * (1 - coalesce(m.discount_percentage, 0) / 100.0))
    ) AS final_price,
    m.discount_percentage,
    m.stock_quantity,
    m.bonus_points_award,
    m.avg_rating,
    m.review_count,
    m.is_new,
    m.category_id,
    CASE WHEN m.brand_id IS NULL THEN NULL ELSE (
      SELECT to_jsonb(x) FROM (
        SELECT b.id, b.name, b.slug FROM public.brands b WHERE b.id = m.brand_id
      ) x
    ) END AS brand,
    coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'image_url', pi.image_url,
        'blur_placeholder', pi.blur_placeholder
      ) ORDER BY pi.display_order NULLS LAST)
      FROM public.product_images pi
      WHERE pi.product_id = m.id
    ), '[]'::jsonb) AS images,
    (CASE WHEN position(m.q_whole IN m.name_key) > 0 THEN 100 ELSE 0 END
      + CASE WHEN position(m.q_whole IN m.brand_key) > 0 THEN 50 ELSE 0 END
      + (
        SELECT count(*) * 10
        FROM unnest((SELECT q.words FROM query q)) AS w
        WHERE position(w IN m.name_key) > 0
      ))::INTEGER AS rank
  FROM matched m
  ORDER BY rank DESC, m.sales_count DESC NULLS LAST, m.name
  LIMIT greatest(coalesce(p_limit, 20), 1)
$$;

COMMENT ON FUNCTION public.search_products(TEXT, INTEGER) IS
'Поиск товаров: транслитерация кириллицы, слова в любом порядке, устойчивость к
словоформам и опечаткам. Возвращает те же поля, что нужны карточке каталога.';

GRANT EXECUTE ON FUNCTION public.search_products(TEXT, INTEGER) TO anon, authenticated;

DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc WHERE proname = 'search_products';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'После миграции осталось % версий search_products', v_count;
  END IF;

  RAISE NOTICE '✅ search_products отдаёт поля карточки каталога';
END $$;

NOTIFY pgrst, 'reload schema';
