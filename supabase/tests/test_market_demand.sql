-- Проверка спроса на рынке (миграция 20261101120000_market_demand).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_market_demand.sql
-- До применения — тем же файлом, подключив миграцию перед ним в одной
-- транзакции: `BEGIN; \i <миграция> \i <этот файл>` (откат в конце снимет и её).
--
-- Всё в одной транзакции с откатом: запросы pg_net, поставленные здесь, не
-- уйдут никуда — воркер берёт только закоммиченные. Проваленная проверка
-- останавливает прогон с текстом «ПРОВАЛ: …».

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;

-- Текст ошибки запроса или «без ошибки» — для проверок отказов.
CREATE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RETURN 'без ошибки';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- Ряд за 24 месяца, кончающийся последним месяцем: база, пик в месяце p_peak (×p_mult)
CREATE FUNCTION pg_temp.series(p_keyword text, p_base integer, p_peak integer, p_mult numeric, p_growth numeric DEFAULT 1)
RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.market_demand_keywords (keyword, search_volume) VALUES (p_keyword, p_base)
  ON CONFLICT (keyword) DO NOTHING;
  INSERT INTO public.market_demand_monthly (keyword, month, search_volume)
  SELECT p_keyword, m::date,
         round(p_base * CASE WHEN extract(month FROM m)::integer = p_peak THEN p_mult ELSE 1 END
                      * CASE WHEN m >= date_trunc('month', now()) - interval '3 months' THEN p_growth ELSE 1 END)::integer
  FROM generate_series(date_trunc('month', now()) - interval '24 months', date_trunc('month', now()) - interval '1 month', interval '1 month') m
  ON CONFLICT (keyword, month) DO UPDATE SET search_volume = EXCLUDED.search_volume;
$$;

-- Ответ DataForSEO: статус задачи и её result
CREATE FUNCTION pg_temp.reply(p_result jsonb, p_code integer DEFAULT 20000, p_message text DEFAULT 'Ok.') RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('status_code', 20000, 'status_message', 'Ok.', 'cost', 0.09,
    'tasks', jsonb_build_array(jsonb_build_object('status_code', p_code, 'status_message', p_message, 'cost', 0.09, 'result', p_result)))::text
$$;

-- 12 месяцев для похожего запроса: 9 по base, последние 3 по last
CREATE FUNCTION pg_temp.months12(p_base integer, p_last integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(jsonb_build_object('year', extract(year FROM m)::integer, 'month', extract(month FROM m)::integer,
                                      'search_volume', CASE WHEN m >= date_trunc('month', now()) - interval '3 months' THEN p_last ELSE p_base END)
                   ORDER BY m DESC)
  FROM generate_series(date_trunc('month', now()) - interval '12 months', date_trunc('month', now()) - interval '1 month', interval '1 month') m
$$;

INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'demand-admin@example.test') RETURNING id AS admin_id \gset

-- ── Права ───────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(NOT has_table_privilege('anon', 'public.market_demand_topics', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.market_demand_runs', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.market_demand_candidates', 'UPDATE'),
                  'таблицы закрыты от гостя и покупателя');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.market_demand_request(uuid, boolean)', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.market_demand_credentials_get()', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.market_demand_summary()', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.market_demand_summary()', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.market_demand_request(uuid, boolean)', 'EXECUTE'),
                  'функции — только service_role');
-- PostgREST грузит safeupdate: UPDATE/DELETE без WHERE там — ошибка, а в psql
-- (здесь) — нет. Поэтому проверка по телам функций (ON CONFLICT DO UPDATE и
-- FOR UPDATE — не то; после слова должно идти имя таблицы)
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL regexp_matches(pg_get_functiondef(p.oid), '(?<!DO |FOR )\m(?:UPDATE|DELETE\s+FROM)\s+[a-z_][^;]*;', 'gi') AS m
  WHERE n.nspname = 'public' AND p.proname LIKE 'market\_demand\_%' AND m[1] !~* '\mWHERE\M'),
  'у каждого UPDATE/DELETE в функциях спроса есть WHERE (safeupdate в PostgREST)');
SELECT pg_temp.ok((SELECT count(*) FROM cron.job WHERE jobname = 'Market Demand Monthly' AND schedule = '30 4 5 * *'
                     AND command LIKE '%market_demand_request(NULL, true)%') = 1
                  AND (SELECT count(*) FROM cron.job WHERE jobname = 'Market Demand Collect' AND schedule = '*/10 4-6 5 * *') = 1,
                  'расписание: запрос 5-го в 04:30 UTC, сбор ответов до 06:59');

-- ── Темы: нормализация и отказы ─────────────────────────────────────────────
INSERT INTO public.market_demand_topics (name, kind, keywords, match_terms)
VALUES ('  Проверка   темы ', 'franchise', ARRAY['  Братц  Кукла ', 'БРАТЦ кукла', 'bratz'], ARRAY[' Bratz ', 'братц*кукл'])
RETURNING id AS topic_id \gset
SELECT pg_temp.ok((SELECT name = 'Проверка темы' AND keywords = ARRAY['братц кукла', 'bratz']
                          AND match_terms = ARRAY['bratz', 'братц*кукл'] AND keyword_cores = ARRAY['братц кукла', 'bratz']
                   FROM public.market_demand_topics WHERE id = :'topic_id'),
                  'фразы строчными, без лишних пробелов и повторов; суть посчитана');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords) VALUES ('Эмодзи', ARRAY['кукла 🎎'])$q$) LIKE '%только буквы%',
                  'эмодзи во фразе — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords) VALUES ('Процент', ARRAY['скидка 50%'])$q$) LIKE '%только буквы%',
                  '«%» во фразе — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords, match_terms) VALUES ('Звёздочка', ARRAY['кукла'], ARRAY['кук%ла'])$q$) LIKE '%только буквы%',
                  '«%» в признаке — отказ («*» можно)');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords) VALUES ('Длинная', ARRAY[repeat('а', 81)])$q$) LIKE '%длиннее 80%',
                  'фраза длиннее 80 знаков — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords) VALUES ('Слова', ARRAY['а б в г д е ж з и к л'])$q$) LIKE '%10 слов%',
                  'больше 10 слов — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords) VALUES ('Пусто', ARRAY['  ', ''])$q$) LIKE '%от 1 до 10 поисковых фраз%',
                  'тема без фраз — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.market_demand_topics (name, keywords) VALUES ('проверка ТЕМЫ', ARRAY['другое'])$q$) LIKE '%market_demand_topics_name_key%',
                  'то же название другим регистром — отказ');
UPDATE public.market_demand_topics SET keywords = ARRAY['Братц', 'кукла братц'] WHERE id = :'topic_id';
SELECT pg_temp.ok((SELECT keywords = ARRAY['братц', 'кукла братц'] AND keyword_cores = ARRAY['братц', 'кукла братц'] AND updated_at = now()
                   FROM public.market_demand_topics WHERE id = :'topic_id'),
                  'правка темы: фразы и суть пересчитаны, updated_at сдвинут');

-- ── Суть запроса, мусор, покрытие ───────────────────────────────────────────
SELECT pg_temp.ok(public.market_demand_core('игрушки для девочек 8 9 лет') = ''
                  AND public.market_demand_core('новогодний подарок ребенку') = ''
                  AND public.market_demand_core('Лабубу купить в Алматы') = 'лабубу'
                  AND public.market_demand_core('мягкая игрушка капибара') = 'капибара'
                  AND public.market_demand_core('игровой набор доктора') = 'игровой доктора'
                  AND public.market_demand_core('кукла братц оригинал') = 'кукла братц',
                  'суть запроса без общих слов');
SELECT pg_temp.ok(public.market_demand_is_noise('лол сюрприз мультик') AND public.market_demand_is_noise('раскраска барби')
                  AND public.market_demand_is_noise('толокар бу') AND public.market_demand_is_noise('kaspi лего')
                  AND public.market_demand_is_noise('майнкрафт играть онлайн')
                  AND NOT public.market_demand_is_noise('кукла лол') AND NOT public.market_demand_is_noise('бульдозер игрушка'),
                  'мусор: мультики, раскраски, б/у, чужие магазины, онлайн-игры — но не «бульдозер»');
SELECT pg_temp.ok(public.market_demand_covered(public.market_demand_core('толокар для детей купить'))
                  AND public.market_demand_covered(public.market_demand_core('конструктор майнкрафт'))
                  AND public.market_demand_covered(public.market_demand_core('игрушка капибара'))
                  AND NOT public.market_demand_covered(public.market_demand_core('мягкая игрушка акула'))
                  AND NOT public.market_demand_covered(public.market_demand_core('кукла монстер'))
                  AND NOT public.market_demand_covered(''),
                  'покрыто темами: та же суть или имя персонажа внутри; тип товара внутри не покрывает');

-- ── Ключ DataForSEO ─────────────────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.err($q$SELECT public.market_demand_credentials_set('логин с пробелом', 'password123', NULL)$q$) LIKE '%Логин API%',
                  'логин с пробелом — отказ');
SELECT pg_temp.ok(pg_temp.err($q$SELECT public.market_demand_credentials_set('a:b', 'password123', NULL)$q$) LIKE '%двоеточием%',
                  'двоеточие в логине (Basic) — отказ');
SELECT pg_temp.ok(pg_temp.err($q$SELECT public.market_demand_credentials_set('api_login', 'short', NULL)$q$) LIKE '%Пароль API%',
                  'короткий пароль — отказ');
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';
SELECT public.market_demand_credentials_set('first_login', 'firstpassword1', :'admin_id');
SELECT public.market_demand_credentials_set(' api_login ', ' s3cretPassWord9 ', :'admin_id');
SELECT pg_temp.ok((SELECT count(*) FROM vault.secrets WHERE name = 'dataforseo_credentials') = 1
                  AND (SELECT login = 'api_login' AND password_last4 = 'ord9' FROM public.market_demand_credentials_status())
                  AND (SELECT login = 'api_login' AND password = 's3cretPassWord9' FROM public.market_demand_credentials_get()),
                  'ключ в Vault один, обновляется на месте; наружу — логин и 4 знака');

-- ── Адрес API ───────────────────────────────────────────────────────────────
SELECT pg_temp.ok(public.market_demand_api_base() = 'https://api.dataforseo.com', 'по умолчанию — настоящий DataForSEO');
SET LOCAL app.market_demand_api = 'https://evil.example.com';
SELECT pg_temp.ok(pg_temp.err('SELECT public.market_demand_api_base()') LIKE '%только локальная заглушка%',
                  'чужой адрес вместо DataForSEO — отказ (ключ не уйдёт)');
SET LOCAL app.market_demand_api = 'http://host.docker.internal:8789';
SELECT pg_temp.ok(public.market_demand_api_base() = 'http://host.docker.internal:8789', 'локальная заглушка — можно');
SET LOCAL app.market_demand_api = '';

-- ── Запрос ──────────────────────────────────────────────────────────────────
UPDATE public.market_demand_topics SET is_active = false WHERE name = 'Тамагочи';
SELECT public.market_demand_request(:'admin_id') AS req \gset
SELECT (:'req'::jsonb ->> 'volumes_run')::bigint AS vrun, (:'req'::jsonb ->> 'ideas_run')::bigint AS irun \gset
SELECT r.request_id AS vreq FROM public.market_demand_runs r WHERE r.id = :vrun \gset
SELECT r.request_id AS ireq FROM public.market_demand_runs r WHERE r.id = :irun \gset

SELECT pg_temp.ok((SELECT count(*) FROM public.market_demand_runs WHERE id IN (:vrun, :irun) AND status = 'pending'
                     AND requested_by = :'admin_id' AND NOT scheduled) = 2,
                  'два запуска «в работе» — объёмы и похожие запросы');
SELECT pg_temp.ok((SELECT url = 'https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live'
                          AND method = 'POST' AND timeout_milliseconds = 120000
                          AND headers ->> 'Authorization' = 'Basic ' || encode(convert_to('api_login:s3cretPassWord9', 'UTF8'), 'base64')
                   FROM net.http_request_queue WHERE id = :vreq),
                  'объёмы: адрес DataForSEO, Basic из Vault, таймаут 2 минуты');
SELECT convert_from(body, 'UTF8')::jsonb -> 0 AS vbody FROM net.http_request_queue WHERE id = :vreq \gset
SELECT pg_temp.ok((:'vbody'::jsonb ->> 'location_code') = '2398' AND (:'vbody'::jsonb ->> 'language_code') = 'ru'
                  AND (:'vbody'::jsonb ->> 'date_from') = to_char(date_trunc('month', now()) - interval '24 months', 'YYYY-MM-DD')
                  AND (:'vbody'::jsonb ->> 'search_partners') = 'false',
                  'объёмы: Казахстан, русский, 24 месяца, без партнёров поиска');
SELECT pg_temp.ok((SELECT array_agg(k ORDER BY k) FROM jsonb_array_elements_text(:'vbody'::jsonb -> 'keywords') k)
                  = (SELECT array_agg(DISTINCT k ORDER BY k) FROM public.market_demand_topics t, unnest(t.keywords) k WHERE t.is_active)
                  AND NOT (:'vbody'::jsonb -> 'keywords') ? 'тамагочи'
                  AND (SELECT keywords_sent FROM public.market_demand_runs WHERE id = :vrun) = jsonb_array_length(:'vbody'::jsonb -> 'keywords'),
                  'объёмы: фразы всех активных тем без повторов, отключённая тема — нет');
SELECT convert_from(body, 'UTF8')::jsonb -> 0 AS ibody FROM net.http_request_queue WHERE id = :ireq \gset
SELECT pg_temp.ok((SELECT url LIKE '%/v3/keywords_data/google_ads/keywords_for_keywords/live' FROM net.http_request_queue WHERE id = :ireq)
                  AND jsonb_array_length(:'ibody'::jsonb -> 'keywords') BETWEEN 1 AND 20
                  AND (:'ibody'::jsonb ->> 'sort_by') = 'search_volume' AND (:'ibody'::jsonb ->> 'include_adult_keywords') = 'false'
                  AND (:'ibody'::jsonb ->> 'location_code') = '2398',
                  'похожие: до 20 затравок, по объёму, без взрослых');

SELECT pg_temp.ok(pg_temp.err(format('SELECT public.market_demand_request(%L)', :'admin_id')) LIKE '%уже идёт%',
                  'второе нажатие, пока идёт первое, — отказ (одна оплата)');
SELECT pg_temp.ok(public.market_demand_request(NULL, true) ->> 'skipped' = 'обновление уже идёт',
                  'плановое во время ручного — пропуск, не ошибка');

-- ── Разбор ответов ──────────────────────────────────────────────────────────
SELECT pg_temp.ok(public.market_demand_ingest(:irun, 200, pg_temp.reply(jsonb_build_array(
    jsonb_build_object('keyword', 'Кукла Монстер', 'search_volume', 900, 'competition_index', 12, 'cpc', 0.07123,
                       'monthly_searches', pg_temp.months12(400, 1600)),
    jsonb_build_object('keyword', 'кукла монстер', 'search_volume', 800, 'monthly_searches', pg_temp.months12(400, 1600)),
    jsonb_build_object('keyword', 'мягкая игрушка акула', 'search_volume', 300, 'monthly_searches', pg_temp.months12(300, 300)),
    jsonb_build_object('keyword', 'лабубу купить', 'search_volume', 5000, 'monthly_searches', pg_temp.months12(9000, 3000)),
    jsonb_build_object('keyword', 'конструктор майнкрафт', 'search_volume', 700, 'monthly_searches', pg_temp.months12(700, 700)),
    jsonb_build_object('keyword', 'игрушки для девочек 8 9 лет', 'search_volume', 2000, 'monthly_searches', pg_temp.months12(2000, 2000)),
    jsonb_build_object('keyword', 'раскраска лол', 'search_volume', 1000, 'monthly_searches', pg_temp.months12(1000, 1000)),
    jsonb_build_object('keyword', 'игрушка бегемот', 'search_volume', 30, 'monthly_searches', pg_temp.months12(30, 30)),
    jsonb_build_object('keyword', 'слайм без клея', 'search_volume', NULL, 'monthly_searches', NULL)
  ))) = 'done', 'похожие запросы разобраны');
SELECT pg_temp.ok((SELECT array_agg(keyword ORDER BY keyword) FROM public.market_demand_candidates)
                  = ARRAY['кукла монстер', 'мягкая игрушка акула'],
                  'в новых — только новое и живое: без покрытых, общих, мусора, редких и пустых; повтор — одной строкой');
SELECT pg_temp.ok((SELECT search_volume = 900 AND trend_pct = 300 AND status = 'new' FROM public.market_demand_candidates WHERE keyword = 'кукла монстер')
                  AND (SELECT trend_pct = 0 FROM public.market_demand_candidates WHERE keyword = 'мягкая игрушка акула'),
                  'тренд нового: последние 3 месяца к 9 перед ними (+300% и 0)');
SELECT pg_temp.ok((SELECT count(*) FROM public.market_demand_monthly WHERE keyword = 'кукла монстер') = 12
                  AND (SELECT cpc = 0.07 AND competition_index = 12 FROM public.market_demand_keywords WHERE keyword = 'кукла монстер')
                  AND NOT EXISTS (SELECT 1 FROM public.market_demand_keywords WHERE keyword IN ('лабубу купить', 'раскраска лол')),
                  'у нового сразу 12 месяцев (тема из него — с цифрами без доплаты); отсеянное не сохраняется');
SELECT pg_temp.ok((SELECT status = 'done' AND items = 2 AND cost = 0.09 AND finished_at IS NOT NULL FROM public.market_demand_runs WHERE id = :irun),
                  'запуск закрыт: 2 новых, цена $0,09');
SELECT pg_temp.ok(public.market_demand_ingest(:irun, 200, pg_temp.reply('[]'::jsonb)) = 'done'
                  AND (SELECT items = 2 FROM public.market_demand_runs WHERE id = :irun),
                  'повторный разбор закрытого запуска ничего не меняет');

UPDATE public.market_demand_candidates SET status = 'dismissed' WHERE keyword = 'мягкая игрушка акула';
INSERT INTO public.market_demand_runs (kind, request_id) VALUES ('ideas', -1) RETURNING id AS irun2 \gset
SELECT public.market_demand_ingest(:irun2, 200, pg_temp.reply(jsonb_build_array(
  jsonb_build_object('keyword', 'мягкая игрушка акула', 'search_volume', 450, 'monthly_searches', pg_temp.months12(300, 600)))));
SELECT pg_temp.ok((SELECT status = 'dismissed' AND search_volume = 450 AND last_seen = now() FROM public.market_demand_candidates
                   WHERE keyword = 'мягкая игрушка акула'),
                  '«Скрыть» держится: свежие цифры пишутся, запрос не всплывает');
SELECT pg_temp.ok((SELECT array_agg(keyword) FROM public.market_demand_candidates_list()) = ARRAY['кукла монстер']
                  AND (SELECT cardinality(series) = 12 AND series[12] = 1600 AND series[1] = 400 FROM public.market_demand_candidates_list()),
                  'список новых: без скрытых, ряд за 12 месяцев от старого к новому');
UPDATE public.market_demand_topics SET keywords = ARRAY['братц', 'кукла братц', 'кукла монстер'] WHERE id = :'topic_id';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.market_demand_candidates_list()),
                  'запрос стал фразой темы — из новых пропал');

-- Ошибки DataForSEO
INSERT INTO public.market_demand_runs (kind, request_id) VALUES ('volumes', -2), ('volumes', -3), ('volumes', -4), ('volumes', -5), ('ideas', -6);
SELECT id AS e1 FROM public.market_demand_runs WHERE request_id = -2 \gset
SELECT id AS e2 FROM public.market_demand_runs WHERE request_id = -3 \gset
SELECT id AS e3 FROM public.market_demand_runs WHERE request_id = -4 \gset
SELECT id AS e4 FROM public.market_demand_runs WHERE request_id = -5 \gset
SELECT id AS e5 FROM public.market_demand_runs WHERE request_id = -6 \gset
SELECT public.market_demand_ingest(:e1, 401, '{"status_code":40100,"status_message":"You are not authorized.","cost":0,"tasks":[]}');
SELECT public.market_demand_ingest(:e2, 200, pg_temp.reply(NULL, 40200, 'Payment Required.'));
SELECT public.market_demand_ingest(:e3, 502, '<html>Bad gateway</html>');
SELECT public.market_demand_ingest(:e4, NULL, NULL, 'DataForSEO не ответил за 2 минуты');
SELECT public.market_demand_ingest(:e5, 200, pg_temp.reply(NULL, 40501, 'Invalid Field: ''keywords''.'));
SELECT pg_temp.ok((SELECT error LIKE '%не принял ключ%' FROM public.market_demand_runs WHERE id = :e1)
                  AND (SELECT error LIKE '%не хватает денег%' FROM public.market_demand_runs WHERE id = :e2)
                  AND (SELECT error = 'DataForSEO ответил не JSON (HTTP 502)' FROM public.market_demand_runs WHERE id = :e3)
                  AND (SELECT error LIKE '%за 2 минуты%' FROM public.market_demand_runs WHERE id = :e4)
                  AND (SELECT error = 'DataForSEO: Invalid Field: ''keywords''. (код 40501)' FROM public.market_demand_runs WHERE id = :e5)
                  AND (SELECT count(*) FROM public.market_demand_runs WHERE id IN (:e1, :e2, :e3, :e4, :e5) AND status = 'failed') = 5,
                  'ошибки по-человечески: ключ, баланс, не JSON, таймаут, прочее — с кодом');

-- Объёмы тем: 24 месяца
SELECT public.market_demand_ingest(:vrun, 200, pg_temp.reply(jsonb_build_array(
  jsonb_build_object('keyword', 'братц', 'search_volume', 500, 'competition_index', 3, 'cpc', 0.05,
    'monthly_searches', (SELECT jsonb_agg(jsonb_build_object('year', extract(year FROM m)::integer, 'month', extract(month FROM m)::integer, 'search_volume', 500))
                         FROM generate_series(date_trunc('month', now()) - interval '24 months', date_trunc('month', now()) - interval '1 month', interval '1 month') m)),
  jsonb_build_object('keyword', 'кукла братц', 'search_volume', NULL, 'monthly_searches', NULL))));
SELECT pg_temp.ok((SELECT status = 'done' AND items = 2 FROM public.market_demand_runs WHERE id = :vrun)
                  AND (SELECT count(*) FROM public.market_demand_monthly WHERE keyword = 'братц') = 24
                  AND (SELECT search_volume IS NULL FROM public.market_demand_keywords WHERE keyword = 'кукла братц'),
                  'объёмы разобраны: 24 месяца; фраза без данных — с пустым объёмом');

-- ── Сбор ответов pg_net ─────────────────────────────────────────────────────
INSERT INTO public.market_demand_runs (kind, request_id) VALUES ('ideas', 990000001) RETURNING id AS c1 \gset
INSERT INTO public.market_demand_runs (kind, request_id) VALUES ('ideas', 990000002) RETURNING id AS c2 \gset
INSERT INTO public.market_demand_runs (kind, request_id, requested_at) VALUES ('ideas', 990000003, now() - interval '61 minutes') RETURNING id AS c3 \gset
INSERT INTO public.market_demand_runs (kind, request_id) VALUES ('ideas', 990000004) RETURNING id AS c4 \gset
INSERT INTO net._http_response (id, status_code, content, timed_out, error_msg, created) VALUES
  (990000001, 200, pg_temp.reply('[]'::jsonb), false, NULL, now()),
  (990000002, NULL, NULL, true, NULL, now());
SELECT pg_temp.ok(public.market_demand_collect() = 3, 'сбор: два ответа и один просроченный — 3 закрыто');
SELECT pg_temp.ok((SELECT status = 'done' FROM public.market_demand_runs WHERE id = :c1)
                  AND (SELECT status = 'failed' AND error LIKE '%за 2 минуты%' FROM public.market_demand_runs WHERE id = :c2)
                  AND (SELECT status = 'failed' AND error = 'Ответа от DataForSEO нет' FROM public.market_demand_runs WHERE id = :c3)
                  AND (SELECT status = 'pending' FROM public.market_demand_runs WHERE id = :c4),
                  'ответ — разобран, таймаут и тишина час — ошибка, свежий без ответа — ждёт');
UPDATE public.market_demand_runs SET status = 'failed' WHERE id = :c4;

-- ── Защита баланса ──────────────────────────────────────────────────────────
SELECT pg_temp.ok(public.market_demand_request(NULL, true) ->> 'skipped' = 'обновлялось меньше 20 дней назад',
                  'плановое после свежего удачного — пропуск');
INSERT INTO public.market_demand_runs (kind, status, requested_at) SELECT 'volumes', 'done', now() - interval '1 hour' FROM generate_series(1, 4);
SELECT pg_temp.ok(pg_temp.err(format('SELECT public.market_demand_request(%L)', :'admin_id')) LIKE '%Не больше 5 обновлений в сутки%',
                  'шестое ручное за сутки — отказ');
DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';
DELETE FROM public.market_demand_runs;
SELECT pg_temp.ok(pg_temp.err('SELECT public.market_demand_request()') LIKE '%Ключ DataForSEO не задан%'
                  AND public.market_demand_request(NULL, true) ->> 'skipped' = 'ключ DataForSEO не задан',
                  'без ключа: ручное — понятный отказ, плановое — молча пропускает');

-- ── Сводка ──────────────────────────────────────────────────────────────────
SELECT extract(month FROM now() AT TIME ZONE 'Asia/Almaty')::integer AS cur \gset
DELETE FROM public.market_demand_monthly;
DELETE FROM public.market_demand_keywords;
-- Толокар: обе фразы с одинаковым рядом — Google склеил варианты, считать один раз; пик в следующем месяце
SELECT pg_temp.series('толокар', 1000, (:cur % 12) + 1, 3);
SELECT pg_temp.series('толокар для детей', 1000, (:cur % 12) + 1, 3);
-- LEGO: разные ряды складываются; пик через полгода, рост последних 3 месяцев вдвое
SELECT pg_temp.series('лего', 4000, ((:cur + 5) % 12) + 1, 2, 2);
SELECT pg_temp.series('lego', 2000, ((:cur + 5) % 12) + 1, 2, 2);

SELECT * INTO TEMP sm FROM public.market_demand_summary();
SELECT pg_temp.ok((SELECT cardinality(series) = 24 AND volume_avg3 = 1000 AND trend_pct = 0 AND peak_month = (:cur % 12) + 1
                          AND peak_ratio > 1.3 AND season_soon
                   FROM sm WHERE name = 'Толокар'),
                  'толокар: одинаковые ряды — один раз, пик в следующем месяце — «скоро сезон»');
SELECT pg_temp.ok((SELECT volume_avg3 = 12000 AND volume_prev3 = 6000 AND trend_pct = 100 AND NOT season_soon
                          AND data_until = (date_trunc('month', now()) - interval '1 month')::date
                   FROM sm WHERE name = 'LEGO'),
                  'LEGO: разные фразы сложены, рост к прошлому году +100%, пик далеко');
SELECT pg_temp.ok((SELECT series IS NULL AND volume_last IS NULL AND trend_pct IS NULL AND peak_month IS NULL AND NOT season_soon
                   FROM sm WHERE name = 'Пазлы'),
                  'тема без данных — пустые цифры, без выдуманного пика');

-- Свои товары: по началу слова, только активные
SELECT our_total AS stich0, our_in_stock AS stich_stock0 FROM sm WHERE name = 'Стич' \gset
SELECT our_total AS house0 FROM sm WHERE name = 'Кукольный домик' \gset
SELECT our_total AS pony0 FROM sm WHERE name = 'My Little Pony' \gset
INSERT INTO public.products (name, slug, price, stock_quantity, is_active) VALUES
  ('Кукольный домик Мечта с мебелью', 'demand-test-house', 1000, 2, true),
  ('Масса для лепки пластичная', 'demand-test-clay', 1000, 5, true),
  ('Игрушка Стич плюшевый', 'demand-test-stitch', 1000, 0, true),
  ('Японский поезд', 'demand-test-train', 1000, 3, true),
  ('Стич неактивный', 'demand-test-stitch-off', 1000, 3, false);
DROP TABLE sm;
SELECT * INTO TEMP sm FROM public.market_demand_summary();
SELECT pg_temp.ok((SELECT our_total - :stich0 = 1 AND our_in_stock - :stich_stock0 = 0 FROM sm WHERE name = 'Стич'),
                  'Стич: свой «Стич» найден, «пластичная» — нет, неактивный не считается');
SELECT pg_temp.ok((SELECT our_total - :house0 = 1 FROM sm WHERE name = 'Кукольный домик')
                  AND (SELECT our_total - :pony0 = 0 FROM sm WHERE name = 'My Little Pony'),
                  '«кукольн*дом» нашёл домик; «японский» — не пони');

ROLLBACK;
