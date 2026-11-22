-- ============================================================================
-- Примерный спрос у товаров поставщиков (22 ноября 2026)
--
-- Владелец 22.11: «для товаров ии должен еще делать примерный поиск а не
-- обязательно по названию товара то есть какой либо анализ». На бою у 104 из
-- 300 последних товаров не нашлось темы спроса — «Спрос: нет данных»: у
-- поставщика «игровое кафе», «трюмо», «музыкальный самолётик», а признаки тем
-- — «кухн», «машинк», «кукл». Точные фразы (18.11) ищут товар по названию, а
-- безымянные игрушки по названию почти никто не ищет.
--
-- ИИ по прочитанному названию разбирает, что это за вещь:
--   • query — как такую вещь ищут, не зная марки: «игрушечный пылесос»,
--     «коляска для кукол». Её вместе с точными фразами проверяет «Узнать
--     спрос» — той же задачей DataForSEO;
--   • topic — тема «Спроса на рынке», ближайшая по смыслу: «полицейская
--     машина» → «Машинки», хотя признак темы «машинк» в названии не найден.
--
--   • supplier_offers.demand_guess — по товарам поста, порядок как в read_items:
--     [{"query": "игрушечный пылесос", "topic": "<uuid темы>"}, …], пустые —
--     null; NULL у колонки — ещё не разбирали. Пишет сервер сайта
--     (server/utils/supplierGuess.ts).
--   • supplier_offer_phrases() — теперь и эти запросы.
--   • supplier_offer_demand() — плюс guess_volumes (ответы DataForSEO на них) и
--     without_guess (прочитанных новых товаров без разбора). Прежние поля — как
--     были: volumes — только точные фразы, границы уровней по ним не сдвигаются.
--
-- Тела функций сняты с боя pg_get_functiondef 22.11.2026 и совпадают с
-- 20261118120000. Сигнатуры те же — CREATE OR REPLACE не плодит перегрузок.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.supplier_offer_phrases(integer)') IS NULL
     OR to_regprocedure('public.supplier_offer_demand()') IS NULL THEN
    RAISE EXCEPTION 'нет функций точного спроса — сначала 20261118120000_supplier_offer_queries';
  END IF;
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('supplier_offer_phrases', 'supplier_offer_demand')
      AND pronamespace = 'public'::regnamespace) <> 2 THEN
    RAISE EXCEPTION 'supplier_offer_phrases или supplier_offer_demand — не по одной версии';
  END IF;
  -- Тела — те, что сняты с боя: точные фразы есть, разбора ИИ ещё нет
  IF position('search_queries' IN pg_get_functiondef('public.supplier_offer_phrases(integer)'::regprocedure)) = 0
     OR position('demand_guess' IN pg_get_functiondef('public.supplier_offer_phrases(integer)'::regprocedure)) > 0
     OR position('without_queries' IN pg_get_functiondef('public.supplier_offer_demand()'::regprocedure)) = 0
     OR position('demand_guess' IN pg_get_functiondef('public.supplier_offer_demand()'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'supplier_offer_phrases или supplier_offer_demand не те, под которые готовилась миграция';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'supplier_offers'
               AND column_name IN ('demand_guess', 'guessed_at')) THEN
    RAISE EXCEPTION 'supplier_offers.demand_guess уже есть — миграция применялась?';
  END IF;
END $$;

-- ── 1. Разбор ИИ ─────────────────────────────────────────────────────────────
ALTER TABLE public.supplier_offers
  ADD COLUMN demand_guess jsonb,
  ADD COLUMN guessed_at timestamptz;
COMMENT ON COLUMN public.supplier_offers.demand_guess IS
  'Разбор ИИ по товарам поста, порядок как в read_items: [{"query": "игрушечный пылесос", "topic": "<uuid темы>"}, …]; NULL — не разбирали';
COMMENT ON COLUMN public.supplier_offers.guessed_at IS 'Когда ИИ разбирал товары поста';

-- ── 2. Какие фразы проверять — и примерные ───────────────────────────────────
-- Прежнее тело плюс запросы из demand_guess; отбор — тот же. Сначала —
-- примерные: их меньше, чем точных, и первая же проверка (до 1000 фраз) даёт
-- уровень почти каждому товару; дальше, как прежде, — по свежести поста.
CREATE OR REPLACE FUNCTION public.supplier_offer_phrases(p_limit integer DEFAULT 1000)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(phrase ORDER BY guess DESC, last_posted DESC, phrase), '{}')
  FROM (
    SELECT q.phrase, max(o.posted_at) AS last_posted, bool_or(q.guess) AS guess
    FROM supplier_offers o
    CROSS JOIN LATERAL (
      -- Точные: по названию товара
      SELECT CASE WHEN jsonb_typeof(raw) = 'string' THEN raw #>> '{}' END AS phrase, false AS guess
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.search_queries) = 'array' THEN o.search_queries ELSE '[]' END) item
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(item) = 'array' THEN item ELSE '[]' END) raw
      UNION ALL
      -- Примерные: как такую вещь ищут, не зная марки
      SELECT CASE WHEN jsonb_typeof(g -> 'query') = 'string' THEN g ->> 'query' END, true
      FROM jsonb_array_elements(CASE WHEN jsonb_typeof(o.demand_guess) = 'array' THEN o.demand_guess ELSE '[]' END) g
    ) q
    WHERE o.status = 'new'
      AND o.posted_at > now() - interval '30 days'
      AND q.phrase ~ '^[0-9a-zа-яёәғқңөұүһі]+( [0-9a-zа-яёәғқңөұүһі]+){0,9}$'
      AND length(q.phrase) BETWEEN 3 AND 80
      AND NOT EXISTS (SELECT 1 FROM market_demand_keywords k
                      WHERE k.keyword = q.phrase AND k.updated_at > now() - interval '20 days')
    GROUP BY q.phrase
    ORDER BY bool_or(q.guess) DESC, last_posted DESC, q.phrase
    LIMIT greatest(p_limit, 0)
  ) s
$$;

-- ── 3. Сводка для страницы — и по примерным ──────────────────────────────────
-- guess_volumes — ответы DataForSEO на запросы разбора ИИ (null — «данных
-- нет»); without_guess — прочитанных новых товаров без разбора.
CREATE OR REPLACE FUNCTION public.supplier_offer_demand()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH phrases AS (
    SELECT DISTINCT raw #>> '{}' AS phrase
    FROM supplier_offers o
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.search_queries) = 'array' THEN o.search_queries ELSE '[]' END) item
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(item) = 'array' THEN item ELSE '[]' END) raw
    WHERE o.posted_at > now() - interval '30 days' AND jsonb_typeof(raw) = 'string'
  ), guesses AS (
    SELECT DISTINCT g ->> 'query' AS phrase
    FROM supplier_offers o
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.demand_guess) = 'array' THEN o.demand_guess ELSE '[]' END) g
    WHERE o.posted_at > now() - interval '30 days' AND jsonb_typeof(g -> 'query') = 'string'
  )
  SELECT jsonb_build_object(
    'volumes', coalesce((SELECT jsonb_object_agg(k.keyword, k.search_volume)
                         FROM market_demand_keywords k JOIN phrases p ON p.phrase = k.keyword), '{}'),
    'guess_volumes', coalesce((SELECT jsonb_object_agg(k.keyword, k.search_volume)
                               FROM market_demand_keywords k JOIN guesses p ON p.phrase = k.keyword), '{}'),
    'unchecked', cardinality(supplier_offer_phrases(100000)),
    'without_queries', (SELECT count(*) FROM supplier_offers
                        WHERE status = 'new' AND posted_at > now() - interval '30 days'
                          AND search_queries IS NULL AND jsonb_typeof(read_items) = 'array'
                          AND jsonb_array_length(read_items) > 0),
    'without_guess', (SELECT count(*) FROM supplier_offers
                      WHERE status = 'new' AND posted_at > now() - interval '30 days'
                        AND demand_guess IS NULL AND jsonb_typeof(read_items) = 'array'
                        AND jsonb_array_length(read_items) > 0),
    'pending', EXISTS (SELECT 1 FROM market_demand_runs WHERE kind = 'offers' AND status = 'pending'),
    'last', (SELECT jsonb_build_object('status', status, 'error', error, 'items', items, 'sent', keywords_sent,
                                       'requested_at', requested_at, 'finished_at', finished_at)
             FROM market_demand_runs WHERE kind = 'offers' ORDER BY id DESC LIMIT 1))
$$;

-- Права CREATE OR REPLACE сохраняет — здесь для ясности, как в 20261118120000
REVOKE ALL ON FUNCTION public.supplier_offer_phrases(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_offer_demand() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_offer_phrases(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.supplier_offer_demand() TO service_role;

-- ── 4. Проверка ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
  v jsonb;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.supplier_offer_phrases(integer)', 'public.supplier_offer_demand()'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION '% доступна не только service_role', f;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('supplier_offer_phrases', 'supplier_offer_demand')
      AND pronamespace = 'public'::regnamespace) <> 2 THEN
    RAISE EXCEPTION 'supplier_offer_phrases или supplier_offer_demand — не по одной версии';
  END IF;
  v := public.supplier_offer_demand();
  IF NOT (v ?& ARRAY['volumes', 'guess_volumes', 'unchecked', 'without_queries', 'without_guess', 'pending', 'last']) THEN
    RAISE EXCEPTION 'supplier_offer_demand() вернула не те поля: %', (SELECT string_agg(k, ', ') FROM jsonb_object_keys(v) k);
  END IF;
  PERFORM public.supplier_offer_phrases(1);
END $$;
