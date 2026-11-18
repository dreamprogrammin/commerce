-- ============================================================================
-- Точный спрос у товаров поставщиков (18 ноября 2026)
--
-- Владелец 18.11: «умный поиск товаров работает слишком широко, типа по
-- запросу «куклы» — нужно, чтобы он ещё узко работал и на основе этого
-- собирал мне товары». На бою из 200 товаров 61 попадал в тему «Кукла»
-- (~13 500 поисков в месяц), и любая кукла получала «Спрос высокий».
--
-- Выбран вариант «фразы от товара»: ИИ по прочитанному названию и бренду
-- подбирает каждому товару 2–3 запроса покупателя («кукла барби
-- ветеринар»), а DataForSEO отвечает, сколько их ищут в Казахстане. Уровень
-- спроса и «Высокий спрос» на «Товарах поставщиков» — по этим фразам.
--
--   • supplier_offers.search_queries — фразы по товарам поста, в том же
--     порядке, что read_items: [["кукла барби ветеринар", …], …]; NULL — ещё
--     не подбирали. Пишет сервер сайта (server/utils/supplierQueries.ts).
--   • market_demand_runs.kind 'offers' — проверка фраз товаров одной
--     задачей search_volume/live (≈ $0,09 до 1000 фраз). Ответ разбирают
--     прежние market_demand_collect() и market_demand_ingest(): особые ветки
--     у них только для 'ideas', остальное — как у объёмов тем. Фразы ложатся
--     в market_demand_keywords и market_demand_monthly рядом с фразами тем.
--   • market_demand_request_offers(p_admin) — отправить непроверенные фразы
--     новых товаров; supplier_offer_phrases() — какие; supplier_offer_demand()
--     — сводка для страницы.
--
-- Прежние функции не меняются — их тела на бою не трогаются.
-- ============================================================================

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regprocedure('public.market_demand_collect()') IS NULL
     OR to_regprocedure('public.market_demand_ingest(bigint, integer, text, text)') IS NULL
     OR to_regprocedure('public.market_demand_api_base()') IS NULL
     OR to_regprocedure('public.market_demand_send_ideas(bigint)') IS NULL THEN
    RAISE EXCEPTION 'нет функций спроса — сначала 20261101120000 и 20261107120000';
  END IF;
  -- Ингест не должен знать вид 'offers': всё, что не 'ideas', он разбирает как объёмы
  IF position('''offers''' IN pg_get_functiondef('public.market_demand_ingest(bigint, integer, text, text)'::regprocedure)) > 0
     OR position('v_run.kind = ''ideas''' IN pg_get_functiondef('public.market_demand_ingest(bigint, integer, text, text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'market_demand_ingest не та, под которую готовилась миграция';
  END IF;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'public.market_demand_runs'::regclass AND conname = 'market_demand_runs_kind_check')
     IS DISTINCT FROM 'CHECK ((kind = ANY (ARRAY[''volumes''::text, ''ideas''::text])))' THEN
    RAISE EXCEPTION 'market_demand_runs.kind — не «volumes, ideas»: миграция применялась?';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'supplier_offers' AND column_name = 'read_items') THEN
    RAISE EXCEPTION 'нет supplier_offers.read_items — сначала 20261105120000_supplier_offers_read';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'supplier_offers' AND column_name = 'search_queries')
     OR to_regproc('public.market_demand_request_offers') IS NOT NULL
     OR to_regproc('public.supplier_offer_phrases') IS NOT NULL
     OR to_regproc('public.supplier_offer_demand') IS NOT NULL THEN
    RAISE EXCEPTION 'search_queries или функции точного спроса уже есть — миграция применялась?';
  END IF;
END $$;

-- ── 1. Фразы товаров ─────────────────────────────────────────────────────────
ALTER TABLE public.supplier_offers
  ADD COLUMN search_queries jsonb,
  ADD COLUMN queries_at timestamptz;
COMMENT ON COLUMN public.supplier_offers.search_queries IS
  'Запросы покупателя по товарам поста, порядок — как в read_items: [["кукла барби ветеринар", …], …]; NULL — не подбирали';
COMMENT ON COLUMN public.supplier_offers.queries_at IS 'Когда ИИ подбирал запросы';

-- ── 2. Вид запуска «фразы товаров» ───────────────────────────────────────────
ALTER TABLE public.market_demand_runs DROP CONSTRAINT market_demand_runs_kind_check;
ALTER TABLE public.market_demand_runs
  ADD CONSTRAINT market_demand_runs_kind_check CHECK (kind = ANY (ARRAY['volumes', 'ideas', 'offers']));

-- ── 3. Какие фразы проверять ─────────────────────────────────────────────────
-- Фразы новых товаров за 30 дней, которых DataForSEO ещё не отвечал или отвечал
-- больше 20 дней назад; сначала — фразы свежих постов. Google Ads берёт фразу
-- до 80 знаков и 10 слов; знаков, кроме букв, цифр и пробела, сервер в фразы
-- не пускает — здесь та же проверка ещё раз: с одной негодной фразой
-- DataForSEO отклоняет всю задачу.
CREATE FUNCTION public.supplier_offer_phrases(p_limit integer DEFAULT 1000)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(phrase ORDER BY last_posted DESC, phrase), '{}')
  FROM (
    SELECT q.phrase, max(o.posted_at) AS last_posted
    FROM supplier_offers o
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(o.search_queries) = 'array' THEN o.search_queries ELSE '[]' END) item
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(item) = 'array' THEN item ELSE '[]' END) raw
    CROSS JOIN LATERAL (SELECT CASE WHEN jsonb_typeof(raw) = 'string' THEN raw #>> '{}' END AS phrase) q
    WHERE o.status = 'new'
      AND o.posted_at > now() - interval '30 days'
      AND q.phrase ~ '^[0-9a-zа-яёәғқңөұүһі]+( [0-9a-zа-яёәғқңөұүһі]+){0,9}$'
      AND length(q.phrase) BETWEEN 3 AND 80
      AND NOT EXISTS (SELECT 1 FROM market_demand_keywords k
                      WHERE k.keyword = q.phrase AND k.updated_at > now() - interval '20 days')
    GROUP BY q.phrase
    ORDER BY last_posted DESC, q.phrase
    LIMIT greatest(p_limit, 0)
  ) s
$$;

-- ── 4. Отправить фразы в DataForSEO ──────────────────────────────────────────
-- Те же предохранители, что у обновления тем: один запрос в работе за раз
-- (тот же замок), до 5 проверок в сутки. Ответ забирает market_demand_collect().
CREATE FUNCTION public.market_demand_request_offers(p_admin uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_creds jsonb;
  v_auth text;
  v_phrases text[];
  v_run bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('market_demand_request'));
  IF EXISTS (SELECT 1 FROM market_demand_runs WHERE status = 'pending' AND request_id IS NOT NULL
             AND requested_at > now() - interval '15 minutes') THEN
    RAISE EXCEPTION 'Запрос в DataForSEO уже идёт — дождитесь ответа';
  END IF;
  IF (SELECT count(*) FROM market_demand_runs
      WHERE kind = 'offers' AND requested_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Не больше 5 проверок в сутки — каждая оплачивается с баланса DataForSEO';
  END IF;

  SELECT decrypted_secret::jsonb INTO v_creds FROM vault.decrypted_secrets WHERE name = 'dataforseo_credentials';
  IF v_creds IS NULL THEN
    RAISE EXCEPTION 'Ключ DataForSEO не задан';
  END IF;

  v_phrases := supplier_offer_phrases(1000);
  IF cardinality(v_phrases) = 0 THEN
    RAISE EXCEPTION 'Проверять нечего: у новых товаров нет непроверенных запросов';
  END IF;

  v_auth := 'Basic ' || replace(encode(convert_to((v_creds ->> 'login') || ':' || (v_creds ->> 'password'), 'UTF8'), 'base64'), E'\n', '');
  INSERT INTO market_demand_runs (kind, scheduled, keywords_sent, requested_by, request_id)
  VALUES ('offers', false, cardinality(v_phrases), p_admin, net.http_post(
    url := market_demand_api_base() || '/v3/keywords_data/google_ads/search_volume/live',
    body := jsonb_build_array(jsonb_build_object(
      'keywords', to_jsonb(v_phrases),
      'location_code', 2398,          -- Казахстан
      'language_code', 'ru',
      'date_from', to_char(date_trunc('month', now()) - interval '24 months', 'YYYY-MM-DD'),
      'search_partners', false)),
    headers := jsonb_build_object('Authorization', v_auth, 'Content-Type', 'application/json'),
    timeout_milliseconds := 120000))
  RETURNING id INTO v_run;

  RETURN jsonb_build_object('run', v_run, 'phrases', cardinality(v_phrases));
END $$;

-- ── 5. Сводка для страницы ───────────────────────────────────────────────────
-- volumes — фразы товаров за 30 дней, на которые DataForSEO уже ответил
-- (null — «данных нет»: ищут слишком редко); unchecked — сколько ждут проверки;
-- pending — проверка идёт; last — последняя проверка.
CREATE FUNCTION public.supplier_offer_demand()
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
  )
  SELECT jsonb_build_object(
    'volumes', coalesce((SELECT jsonb_object_agg(k.keyword, k.search_volume)
                         FROM market_demand_keywords k JOIN phrases p ON p.phrase = k.keyword), '{}'),
    'unchecked', cardinality(supplier_offer_phrases(100000)),
    'without_queries', (SELECT count(*) FROM supplier_offers
                        WHERE status = 'new' AND posted_at > now() - interval '30 days'
                          AND search_queries IS NULL AND jsonb_typeof(read_items) = 'array'
                          AND jsonb_array_length(read_items) > 0),
    'pending', EXISTS (SELECT 1 FROM market_demand_runs WHERE kind = 'offers' AND status = 'pending'),
    'last', (SELECT jsonb_build_object('status', status, 'error', error, 'items', items, 'sent', keywords_sent,
                                       'requested_at', requested_at, 'finished_at', finished_at)
             FROM market_demand_runs WHERE kind = 'offers' ORDER BY id DESC LIMIT 1))
$$;

REVOKE ALL ON FUNCTION public.supplier_offer_phrases(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_demand_request_offers(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.supplier_offer_demand() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supplier_offer_phrases(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.market_demand_request_offers(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.supplier_offer_demand() TO service_role;

-- ── 6. Проверка ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.supplier_offer_phrases(integer)', 'public.market_demand_request_offers(uuid)',
                           'public.supplier_offer_demand()'] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE') OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION '% доступна не только service_role', f;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_proc WHERE proname IN ('supplier_offer_phrases', 'market_demand_request_offers', 'supplier_offer_demand')
      AND pronamespace = 'public'::regnamespace) <> 3 THEN
    RAISE EXCEPTION 'функций точного спроса не ровно по одной';
  END IF;
END $$;
