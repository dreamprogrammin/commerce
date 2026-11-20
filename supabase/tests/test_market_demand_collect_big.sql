-- Большой ответ DataForSEO — планировщику, не странице (миграция 20261120140000_market_demand_collect_big).
--
-- Только на ЛОКАЛЬНОЙ базе:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_market_demand_collect_big.sql
-- До применения — `BEGIN; \i <миграция> \i <этот файл>`. Всё откатывается.
--
-- 20.11.2026 на бою «похожие» вернули 39 МБ, и разбор со страницы падал по
-- statement_timeout 8 с. Локально разбор быстрее, поэтому здесь страница
-- изображается коротким таймаутом, а «большой» — ответ больше 300 КБ в хранении.

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;
-- Ответ «похожих»: p_n фраз от 50 запросов, слова неповторимые — чтобы не сжалось
CREATE FUNCTION pg_temp.reply(p_n integer) RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('status_code', 20000, 'cost', 0.09, 'tasks', jsonb_build_array(jsonb_build_object(
    'status_code', 20000, 'status_message', 'Ok.', 'result', coalesce(jsonb_agg(jsonb_build_object(
      'keyword', 'проба ' || translate(md5(g::text), '0123456789', 'абвгдежзик') || ' ' || md5('x' || g),
      'search_volume', 50 + g, 'competition_index', 10, 'cpc', 0.5,
      'monthly_searches', jsonb_build_array(jsonb_build_object('year', 2026, 'month', 10, 'search_volume', 50 + g)))), '[]'))))::text
  FROM generate_series(1, p_n) g
$$;
CREATE FUNCTION pg_temp.run(p_id bigint, p_content text) RETURNS bigint LANGUAGE sql AS $$
  WITH resp AS (
    INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg, created)
    VALUES (p_id, 200, p_content, false, NULL, now()) RETURNING id
  )
  INSERT INTO public.market_demand_runs (kind, status, scheduled, keywords_sent, request_id, requested_at, attempts)
  SELECT 'ideas', 'pending', false, 16, id, now(), 1 FROM resp RETURNING id
$$;

UPDATE public.market_demand_runs SET status = 'failed' WHERE status = 'pending';
SELECT cron.unschedule('Market Demand Collect Big') FROM cron.job WHERE jobname = 'Market Demand Collect Big';

-- 1) большой ответ, зовёт страница (таймаут 8 с) — не разбирать, включить планировщик
SELECT pg_temp.run(990001, pg_temp.reply(20000)) AS big \gset
SELECT pg_temp.ok(pg_column_size(content) > 300000, 'ответ больше порога (' || pg_column_size(content) || ' байт)')
FROM net._http_response WHERE id = 990001;
SET LOCAL statement_timeout = '8s';
SELECT public.market_demand_collect() AS done \gset
SET LOCAL statement_timeout = 0;
SELECT pg_temp.ok(:done = 0 AND (SELECT status FROM public.market_demand_runs WHERE id = :big) = 'pending',
                  'страница: большой ответ не разобран, запуск ждёт');
SELECT pg_temp.ok((SELECT schedule = '30 seconds' AND command LIKE '%market_demand_collect()%' FROM cron.job WHERE jobname = 'Market Demand Collect Big'),
                  'страница: включена задача «Market Demand Collect Big» раз в 30 с');
SET LOCAL statement_timeout = '8s';
SELECT public.market_demand_collect();
SET LOCAL statement_timeout = 0;
SELECT pg_temp.ok((SELECT count(*) FROM cron.job WHERE jobname = 'Market Demand Collect Big') = 1, 'второй заход страницы — задача одна');

-- 2) планировщик (таймаут сервера) — разбирает и снимает задачу
SELECT public.market_demand_collect() AS done \gset
SELECT pg_temp.ok(:done = 1 AND (SELECT status = 'done' AND items > 0 AND cost = 0.09 FROM public.market_demand_runs WHERE id = :big),
                  'планировщик: разобрал большой ответ');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Collect Big'), 'планировщик: ждать нечего — задача снята');

-- 3) обычный ответ со страницы — как раньше, сразу
SELECT pg_temp.run(990002, pg_temp.reply(30)) AS small \gset
SET LOCAL statement_timeout = '8s';
SELECT public.market_demand_collect() AS done \gset
SET LOCAL statement_timeout = 0;
SELECT pg_temp.ok(:done = 1 AND (SELECT status FROM public.market_demand_runs WHERE id = :small) = 'done'
                  AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Collect Big'),
                  'страница: небольшой ответ разобран сразу, планировщик не нужен');

-- 4) «Too many requests» у похожих — повтор, как раньше (JSON теперь разбирается один раз)
SELECT pg_temp.run(990003, '{"status_code":20000,"tasks":[{"status_code":50301,"status_message":"Too many requests."}]}') AS busy \gset
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'pending' AND request_id IS NULL FROM public.market_demand_runs WHERE id = :busy), '50301 — повтор через минуту');

ROLLBACK;
