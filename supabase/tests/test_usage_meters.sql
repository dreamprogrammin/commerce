-- Проверка «батареек» дашборда (миграция 20261106120000_usage_meters).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   docker exec -i supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -X -At \
--     < supabase/tests/test_usage_meters.sql
-- Всё в одной транзакции с откатом. Проваленная проверка останавливает прогон
-- с текстом «ПРОВАЛ: …».

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;

CREATE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RETURN 'без ошибки';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- Расход копится, а не перезаписывается; день — по Алматы
DELETE FROM public.ai_usage_daily WHERE model = 'probe/model';
SELECT public.ai_usage_add('probe/model', 2000, 300, 1);
SELECT public.ai_usage_add('probe/model', 1000, 100, 2);
SELECT pg_temp.ok(
  (SELECT input_tokens = 3000 AND output_tokens = 400 AND posts = 3 AND day = (now() AT TIME ZONE 'Asia/Almaty')::date
   FROM public.ai_usage_daily WHERE model = 'probe/model'),
  'ai_usage_add складывает токены и чтения за день по Алматы');
SELECT public.ai_usage_add('probe/model', -5, -5, -5);
SELECT pg_temp.ok((SELECT input_tokens = 3000 AND posts = 3 FROM public.ai_usage_daily WHERE model = 'probe/model'), 'отрицательное не вычитает');
SELECT pg_temp.ok((SELECT count(*) = 1 FROM public.ai_usage_daily WHERE model = 'probe/model'), 'одна строка на день и модель');
SELECT pg_temp.ok(pg_temp.err($$INSERT INTO public.ai_usage_daily (day, model, input_tokens) VALUES (current_date, 'probe/x', -1)$$) LIKE '%check%', 'отрицательных токенов таблица не держит');

-- Показания перезаписываются по ключу
INSERT INTO public.service_meters (key, value) VALUES ('probe', '{"a":1}');
SELECT pg_temp.ok(pg_temp.err($$INSERT INTO public.service_meters (key, value) VALUES ('probe', '{"a":2}')$$) LIKE '%duplicate%', 'ключ показаний уникален');

-- Права: anon и authenticated — никак, service_role — да
SET LOCAL ROLE anon;
SELECT pg_temp.ok(pg_temp.err('SELECT * FROM public.ai_usage_daily') LIKE '%permission denied%', 'anon не читает расход');
SELECT pg_temp.ok(pg_temp.err('SELECT * FROM public.service_meters') LIKE '%permission denied%', 'anon не читает показания');
SELECT pg_temp.ok(pg_temp.err($$SELECT public.ai_usage_add('x/y', 1, 1, 1)$$) LIKE '%permission denied%', 'anon не пишет расход');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(pg_temp.err('SELECT * FROM public.ai_usage_daily') LIKE '%permission denied%', 'authenticated не читает расход');
SELECT pg_temp.ok(pg_temp.err($$INSERT INTO public.service_meters (key, value) VALUES ('x', '{}')$$) LIKE '%permission denied%', 'authenticated не пишет показания');
SELECT pg_temp.ok(pg_temp.err($$SELECT public.ai_usage_add('x/y', 1, 1, 1)$$) LIKE '%permission denied%', 'authenticated не пишет расход');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.ok(pg_temp.err($$SELECT public.ai_usage_add('probe/model', 1, 1, 1)$$) = 'без ошибки', 'service_role пишет расход');
SELECT pg_temp.ok(pg_temp.err($$INSERT INTO public.service_meters (key, value) VALUES ('probe2', '{}') ON CONFLICT (key) DO UPDATE SET value = excluded.value$$) = 'без ошибки', 'service_role пишет показания');
RESET ROLE;

SELECT pg_temp.ok((SELECT count(*) = 1 FROM pg_proc WHERE proname = 'ai_usage_add'), 'ai_usage_add — ровно одна версия');

ROLLBACK;
