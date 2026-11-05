-- Похожие запросы — после объёмов, с повтором на 50301 (миграция 20261107120000_market_demand_ideas_queue).
--
-- Только на ЛОКАЛЬНОЙ базе:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_market_demand_ideas_queue.sql
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
CREATE FUNCTION pg_temp.reply(p_code integer, p_message text) RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('status_code', 20000, 'cost', 0, 'tasks', jsonb_build_array(jsonb_build_object(
    'status_code', p_code, 'status_message', p_message, 'result', CASE WHEN p_code = 20000 THEN '[]'::jsonb END)))::text
$$;
-- Ответ pg_net на запрос запуска
CREATE FUNCTION pg_temp.answer(p_run bigint, p_content text) RETURNS void LANGUAGE sql AS $$
  INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg, created)
  SELECT request_id, 200, p_content, false, NULL, now() FROM public.market_demand_runs WHERE id = p_run
$$;

UPDATE public.market_demand_runs SET status = 'failed' WHERE status = 'pending';
DELETE FROM public.market_demand_runs WHERE requested_at > now() - interval '24 hours';
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';
SELECT vault.create_secret('{"login":"api_login","password":"s3cretPassWord9"}', 'dataforseo_credentials');
INSERT INTO public.market_demand_topics (name, kind, keywords) VALUES ('Проверка очереди', 'type', '{"проверка очереди"}')
ON CONFLICT DO NOTHING;

SELECT public.market_demand_request(NULL) AS req \gset
SELECT (:'req'::jsonb ->> 'volumes_run')::bigint AS vrun, (:'req'::jsonb ->> 'ideas_run')::bigint AS irun \gset

SELECT pg_temp.ok((SELECT request_id IS NOT NULL FROM public.market_demand_runs WHERE id = :vrun)
                  AND (SELECT request_id IS NULL AND attempts = 0 AND status = 'pending' AND keywords_sent = 16 FROM public.market_demand_runs WHERE id = :irun),
                  'запрос: объёмы ушли, похожие — в очереди');
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT request_id IS NULL FROM public.market_demand_runs WHERE id = :irun),
                  'пока объёмы без ответа — похожие не уходят');

SELECT pg_temp.answer(:vrun, pg_temp.reply(20000, 'Ok.'));
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'done' FROM public.market_demand_runs WHERE id = :vrun)
                  AND (SELECT request_id IS NOT NULL AND attempts = 1 FROM public.market_demand_runs WHERE id = :irun)
                  AND (SELECT url LIKE '%/keywords_for_keywords/live' AND headers ->> 'Authorization' LIKE 'Basic %'
                       FROM net.http_request_queue q JOIN public.market_demand_runs r ON r.request_id = q.id WHERE r.id = :irun),
                  'объёмы ответили — похожие ушли тем же сбором, с ключом из Vault');

-- 50301 — обратно в очередь на минуту
SELECT pg_temp.answer(:irun, pg_temp.reply(50301, 'Too many requests.'));
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'pending' AND request_id IS NULL AND requested_at > now() + interval '50 seconds' FROM public.market_demand_runs WHERE id = :irun),
                  '«Too many requests» — снова в очереди, через минуту');
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT request_id IS NULL FROM public.market_demand_runs WHERE id = :irun), 'до срока не уходит');

-- Срок настал: вторая попытка, снова 50301, третья — и после неё уже ошибка
UPDATE public.market_demand_runs SET requested_at = now() - interval '1 second' WHERE id = :irun;
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT request_id IS NOT NULL AND attempts = 2 FROM public.market_demand_runs WHERE id = :irun), 'срок настал — вторая попытка');
SELECT pg_temp.answer(:irun, pg_temp.reply(50301, 'Too many requests.'));
SELECT public.market_demand_collect();
UPDATE public.market_demand_runs SET requested_at = now() - interval '1 second' WHERE id = :irun;
SELECT public.market_demand_collect();
SELECT pg_temp.answer(:irun, pg_temp.reply(50301, 'Too many requests.'));
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'failed' AND attempts = 3 AND error = 'DataForSEO: Too many requests. (код 50301)' FROM public.market_demand_runs WHERE id = :irun),
                  'третий отказ — ошибка с кодом, больше не повторяем');

-- Повтор только у похожих: объёмы на 50301 — ошибка сразу (оплата не дважды)
INSERT INTO public.market_demand_runs (kind, request_id) VALUES ('volumes', 990000101) RETURNING id AS v2 \gset
SELECT pg_temp.answer(:v2, pg_temp.reply(50301, 'Too many requests.'));
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'failed' FROM public.market_demand_runs WHERE id = :v2), 'объёмы на 50301 не повторяются');

-- Удачный ответ похожих после повтора — разобран
INSERT INTO public.market_demand_runs (kind, request_id, attempts) VALUES ('ideas', NULL, 0) RETURNING id AS i2 \gset
SELECT public.market_demand_collect();
SELECT pg_temp.answer(:i2, pg_temp.reply(20000, 'Ok.'));
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'done' AND attempts = 1 FROM public.market_demand_runs WHERE id = :i2), 'похожие ответили — разобраны');

-- Очередь, застрявшая на час, — ошибка, а не вечное «идёт»
INSERT INTO public.market_demand_runs (kind, request_id, attempts, requested_at) VALUES ('ideas', NULL, 0, now() - interval '61 minutes') RETURNING id AS i3 \gset
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'failed' AND error = 'Запрос так и не ушёл в DataForSEO' FROM public.market_demand_runs WHERE id = :i3), 'застрявшая очередь — ошибка');

-- Ключ удалили, пока похожие ждали
INSERT INTO public.market_demand_runs (kind, request_id, attempts) VALUES ('ideas', NULL, 0) RETURNING id AS i4 \gset
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';
SELECT public.market_demand_collect();
SELECT pg_temp.ok((SELECT status = 'failed' AND error = 'Ключ DataForSEO не задан' FROM public.market_demand_runs WHERE id = :i4), 'без ключа — ошибка, не отправка');

SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.market_demand_send_ideas(bigint)', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.market_demand_send_ideas(bigint)', 'EXECUTE'),
                  'отправка похожих наружу закрыта');

ROLLBACK;
