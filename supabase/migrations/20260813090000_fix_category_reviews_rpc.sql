-- Починка RPC отзывов по категории.
--
-- get_latest_category_reviews и get_category_rating_distribution не работали
-- ни разу с момента создания (6 апреля 2026): блок отзывов на страницах
-- категорий всегда падал с «relation "reviews" does not exist», в консоли
-- браузера — «Error loading category reviews».
--
-- В телах обеих функций неверна не только таблица. Разошлось всё, к чему они
-- обращаются:
--
--   FROM reviews                      -> таблица называется product_reviews
--   get_category_and_children_ids(..) -> принимает text (слаг), а передаётся uuid;
--                                        для uuid есть отдельный хелпер _by_uuid
--   prof.full_name                    -> в profiles такой колонки нет,
--                                        есть first_name и last_name
--   review_id bigint                  -> product_reviews.id имеет тип uuid
--   нет фильтра по is_published       -> в публичный блок попали бы отзывы,
--                                        не прошедшие модерацию
--
-- Фильтр по is_published дублирует RLS-политику «Anyone can read published
-- reviews» намеренно: политика закрывает анонимов, но функции объявлены
-- SECURITY INVOKER, и вызов из-под админа вернул бы немодерированное
-- в публичный листинг категории.

-- ---------------------------------------------------------------------------
-- Проверка состояния. Падаем, если база не та, под которую готовилась правка.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.product_reviews') IS NULL THEN
    RAISE EXCEPTION 'Нет таблицы public.product_reviews — база не та, под которую готовилась миграция';
  END IF;

  IF to_regclass('public.reviews') IS NOT NULL THEN
    RAISE EXCEPTION 'Найдена таблица public.reviews: миграция исходит из того, что её не существует';
  END IF;

  IF to_regprocedure('public.get_category_and_children_ids_by_uuid(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции get_category_and_children_ids_by_uuid(uuid)';
  END IF;

  IF to_regprocedure('public.get_latest_category_reviews(uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции get_latest_category_reviews(uuid, integer) — сигнатура разошлась';
  END IF;

  IF to_regprocedure('public.get_category_rating_distribution(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции get_category_rating_distribution(uuid)';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Распределение оценок. Тип результата не меняется, хватает REPLACE.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_rating_distribution(p_category_id uuid)
RETURNS TABLE (
  stars INTEGER,
  count BIGINT
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    r.rating::INTEGER AS stars,
    COUNT(*)::BIGINT AS count
  FROM product_reviews r
  JOIN products p ON p.id = r.product_id
  WHERE r.is_published = TRUE
    AND p.category_id IN (
      SELECT id FROM get_category_and_children_ids_by_uuid(p_category_id)
    )
  GROUP BY r.rating
  ORDER BY r.rating DESC;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Последние отзывы. review_id меняет тип bigint -> uuid, поэтому
--    CREATE OR REPLACE не подходит: PostgreSQL запрещает менять тип результата.
--    Сносим старую сигнатуру явно (см. CLAUDE.md, «Прод-база», п. 10-11).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_latest_category_reviews(uuid, integer);

CREATE FUNCTION public.get_latest_category_reviews(
  p_category_id UUID,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  review_id UUID,
  rating INTEGER,
  text TEXT,
  created_at TIMESTAMPTZ,
  user_name TEXT,
  product_name TEXT,
  product_slug TEXT
)
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    r.id AS review_id,
    r.rating::INTEGER,
    r.text,
    r.created_at,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', prof.first_name, prof.last_name)), ''),
      'Покупатель'
    ) AS user_name,
    p.name AS product_name,
    p.slug AS product_slug
  FROM product_reviews r
  JOIN products p ON p.id = r.product_id
  LEFT JOIN profiles prof ON prof.id = r.user_id
  WHERE r.is_published = TRUE
    AND p.category_id IN (
      SELECT id FROM get_category_and_children_ids_by_uuid(p_category_id)
    )
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Контроль: ровно по одной версии каждой функции, перегрузок не осталось.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  n_latest INTEGER;
  n_distribution INTEGER;
BEGIN
  SELECT count(*) INTO n_latest
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_latest_category_reviews';

  SELECT count(*) INTO n_distribution
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_category_rating_distribution';

  IF n_latest <> 1 THEN
    RAISE EXCEPTION 'get_latest_category_reviews: осталось версий %, ожидалась одна', n_latest;
  END IF;

  IF n_distribution <> 1 THEN
    RAISE EXCEPTION 'get_category_rating_distribution: осталось версий %, ожидалась одна', n_distribution;
  END IF;
END $$;
