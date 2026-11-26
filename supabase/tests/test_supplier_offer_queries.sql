-- Точный спрос у товаров поставщиков (миграция 20261118120000_supplier_offer_queries).
--
-- Только на ЛОКАЛЬНОЙ базе:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_supplier_offer_queries.sql
-- До применения — `BEGIN; \i <миграция> \i <этот файл>`. Всё откатывается; запросы pg_net
-- из незакоммиченной транзакции никуда не уходят.

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;
CREATE FUNCTION pg_temp.fails(sql text, pattern text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN SQLERRM LIKE pattern;
END $$;

-- Своё окружение: ни чужих запусков, ни чужих фраз
UPDATE public.market_demand_runs SET status = 'failed' WHERE status = 'pending';
DELETE FROM public.market_demand_runs WHERE requested_at > now() - interval '24 hours';
UPDATE public.supplier_offers SET status = 'skipped' WHERE status = 'new';
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';

INSERT INTO public.suppliers (name) VALUES ('Проверка точного спроса') RETURNING id AS sup \gset
INSERT INTO public.supplier_channels (supplier_id, title, chat_type, username)
VALUES (:'sup', 'Проверка точного спроса', 'channel', 'probe_narrow') RETURNING id AS ch \gset
INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url, read_items, search_queries) VALUES
  (:'ch', 1, now() - interval '1 hour', 'https://t.me/probe_narrow/1', '[{"name":"Кукла Барби ветеринар"}]',
   '[["кукла барби ветеринар", "кукла с питомцем"]]'),
  -- Два товара в посте; у второго фраза повторяет первую — уходит один раз
  (:'ch', 2, now() - interval '2 hours', 'https://t.me/probe_narrow/2', '[{"name":"Машинка"},{"name":"Кукла"}]',
   '[["машинка на пульте"], ["кукла с питомцем", "кукла пупс"]]'),
  -- Негодные фразы: знаки, длина, одиннадцать слов, не строка, не массив
  (:'ch', 3, now() - interval '3 hours', 'https://t.me/probe_narrow/3', '[{"name":"x"}]',
   '[["кукла!", "ab", "раз два три четыре пять шесть семь восемь девять десять одиннадцать", 5], "не массив"]'),
  -- Разобранный и старый — мимо
  (:'ch', 4, now() - interval '1 hour', 'https://t.me/probe_narrow/4', '[{"name":"x"}]', '[["робот трансформер"]]'),
  (:'ch', 5, now() - interval '40 days', 'https://t.me/probe_narrow/5', '[{"name":"x"}]', '[["конструктор лего"]]'),
  -- Прочитан, а запросов ещё нет
  (:'ch', 6, now() - interval '1 hour', 'https://t.me/probe_narrow/6', '[{"name":"Пазл"}]', NULL);
UPDATE public.supplier_offers SET status = 'added' WHERE channel_id = :'ch' AND message_id = 4;

SELECT pg_temp.ok(public.supplier_offer_phrases() = ARRAY['кукла барби ветеринар', 'кукла с питомцем', 'кукла пупс', 'машинка на пульте'],
                  'фразы: новые товары за 30 дней, без повторов, свежие посты первыми, негодные — мимо');
SELECT pg_temp.ok(public.supplier_offer_phrases(2) = ARRAY['кукла барби ветеринар', 'кукла с питомцем'], 'не больше заданного');

-- Проверенная недавно фраза второй раз не уходит; давно — уходит
INSERT INTO public.market_demand_keywords (keyword, search_volume, updated_at) VALUES
  ('кукла пупс', 90, now() - interval '1 day'),
  ('машинка на пульте', 1300, now() - interval '25 days')
ON CONFLICT (keyword) DO UPDATE SET search_volume = EXCLUDED.search_volume, updated_at = EXCLUDED.updated_at;
SELECT pg_temp.ok(public.supplier_offer_phrases() = ARRAY['кукла барби ветеринар', 'кукла с питомцем', 'машинка на пульте'],
                  'проверенная за 20 дней — не уходит, старше — уходит');

SELECT public.supplier_offer_demand() AS d \gset
SELECT pg_temp.ok((:'d'::jsonb -> 'volumes') @> '{"кукла пупс": 90, "машинка на пульте": 1300}'
                  AND NOT (:'d'::jsonb -> 'volumes') ? 'кукла барби ветеринар'
                  AND (:'d'::jsonb ->> 'unchecked')::int = 3
                  AND (:'d'::jsonb ->> 'without_queries')::int = 1
                  AND (:'d'::jsonb ->> 'pending')::boolean = false
                  AND :'d'::jsonb -> 'last' = 'null',
                  'сводка: цифры фраз, непроверенных 3, без запросов 1, проверок не было');

-- Без ключа — понятный отказ
SELECT pg_temp.ok(pg_temp.fails('SELECT public.market_demand_request_offers(NULL)', 'Ключ DataForSEO не задан%'), 'без ключа — «ключ не задан»');

SELECT vault.create_secret('{"login":"api_login","password":"s3cretPassWord9"}', 'dataforseo_credentials');
SELECT public.market_demand_request_offers(NULL) AS req \gset
SELECT (:'req'::jsonb ->> 'run')::bigint AS run \gset
SELECT pg_temp.ok((:'req'::jsonb ->> 'phrases')::int = 3
                  AND (SELECT kind = 'offers' AND status = 'pending' AND keywords_sent = 3 AND request_id IS NOT NULL
                       FROM public.market_demand_runs WHERE id = :run),
                  'запрос ушёл: вид offers, 3 фразы');
SELECT pg_temp.ok((SELECT q.url LIKE '%/v3/keywords_data/google_ads/search_volume/live'
                          AND q.headers ->> 'Authorization' LIKE 'Basic %'
                          AND (convert_from(q.body, 'UTF8')::jsonb -> 0 -> 'keywords') = '["кукла барби ветеринар", "кукла с питомцем", "машинка на пульте"]'
                          AND (convert_from(q.body, 'UTF8')::jsonb -> 0 ->> 'location_code') = '2398'
                   FROM net.http_request_queue q JOIN public.market_demand_runs r ON r.request_id = q.id WHERE r.id = :run),
                  'в DataForSEO — search_volume по Казахстану, фразы и ключ из Vault');
SELECT pg_temp.ok((public.supplier_offer_demand() ->> 'pending')::boolean, 'сводка: проверка идёт');
SELECT pg_temp.ok(pg_temp.fails('SELECT public.market_demand_request_offers(NULL)', 'Запрос в DataForSEO уже идёт%'), 'второй, пока первый в работе, — отказ');

-- Ответ разбирают прежние collect и ingest: фразы — в market_demand_keywords и помесячно
INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg, created)
SELECT request_id, 200, jsonb_build_object('status_code', 20000, 'cost', 0.09, 'tasks', jsonb_build_array(jsonb_build_object(
  'status_code', 20000, 'status_message', 'Ok.', 'result', jsonb_build_array(
    jsonb_build_object('keyword', 'кукла барби ветеринар', 'search_volume', 140,
                       'monthly_searches', jsonb_build_array(jsonb_build_object('year', 2026, 'month', 10, 'search_volume', 170))),
    jsonb_build_object('keyword', 'кукла с питомцем', 'search_volume', NULL, 'monthly_searches', NULL),
    jsonb_build_object('keyword', 'машинка на пульте', 'search_volume', 1600, 'monthly_searches', '[]'::jsonb)))))::text,
  false, NULL, now()
FROM public.market_demand_runs WHERE id = :run;
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'done' AND items = 3 AND cost = 0.09 FROM public.market_demand_runs WHERE id = :run)
                  AND (SELECT search_volume FROM public.market_demand_keywords WHERE keyword = 'кукла барби ветеринар') = 140
                  AND (SELECT search_volume IS NULL FROM public.market_demand_keywords WHERE keyword = 'кукла с питомцем')
                  AND (SELECT search_volume FROM public.market_demand_keywords WHERE keyword = 'машинка на пульте') = 1600
                  AND (SELECT search_volume FROM public.market_demand_monthly WHERE keyword = 'кукла барби ветеринар' AND month = '2026-10-01') = 170,
                  'ответ разобран прежним сбором: цифры фраз и месяцы, «данных нет» — null');
SELECT public.supplier_offer_demand() AS d2 \gset
SELECT pg_temp.ok((:'d2'::jsonb ->> 'unchecked')::int = 0
                  AND (:'d2'::jsonb -> 'volumes') @> '{"кукла барби ветеринар": 140, "кукла с питомцем": null}'
                  AND (:'d2'::jsonb -> 'last' ->> 'status') = 'done' AND (:'d2'::jsonb -> 'last' ->> 'items')::int = 3,
                  'после ответа — непроверенных нет, «данных нет» — null, последняя проверка — готово');
SELECT pg_temp.ok(pg_temp.fails('SELECT public.market_demand_request_offers(NULL)', 'Проверять нечего%'), 'всё проверено — «проверять нечего»');
SELECT pg_temp.ok((SELECT count(*) FROM public.market_demand_candidates WHERE keyword IN ('кукла барби ветеринар', 'машинка на пульте')) = 0,
                  'фразы товаров не попадают в «похожие запросы»');

-- Не больше 5 проверок в сутки
UPDATE public.supplier_offers SET search_queries = '[["новая фраза"]]' WHERE channel_id = :'ch' AND message_id = 6;
INSERT INTO public.market_demand_runs (kind, status, requested_at, keywords_sent)
SELECT 'offers', 'done', now() - interval '1 hour', 1 FROM generate_series(1, 4);
SELECT pg_temp.ok(pg_temp.fails('SELECT public.market_demand_request_offers(NULL)', 'Не больше 5 проверок в сутки%'), 'шестая за сутки — отказ');

-- Права: только service_role
SELECT pg_temp.ok(NOT has_function_privilege('authenticated', 'public.market_demand_request_offers(uuid)', 'EXECUTE')
                  AND NOT has_function_privilege('anon', 'public.supplier_offer_demand()', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.supplier_offer_phrases(integer)', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.supplier_offer_demand()', 'EXECUTE'),
                  'функции — только service_role');
SELECT pg_temp.ok(pg_temp.fails($q$INSERT INTO public.market_demand_runs (kind) VALUES ('другое')$q$, '%market_demand_runs_kind_check%'),
                  'вид запуска — только volumes, ideas, offers');

ROLLBACK;
