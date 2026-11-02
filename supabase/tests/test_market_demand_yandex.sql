-- Проверка Вордстата в спросе на рынке (миграция 20261102120000_market_demand_yandex).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   docker exec -i supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -X -At \
--     < supabase/tests/test_market_demand_yandex.sql
-- До применения — тем же файлом, подключив миграцию перед ним в одной
-- транзакции: `BEGIN; \i <миграция> \i <этот файл>` (откат в конце снимет и её).
--
-- Всё в одной транзакции с откатом: запросы pg_net и тик в расписании,
-- поставленные здесь, не уйдут никуда — воркер pg_net и pg_cron видят только
-- закоммиченное. Ответы Вордстата подкладываются в net._http_response, время
-- «проходит» сдвигом next_at / paused_until / sent_at. Проваленная проверка
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

-- Ответ динамики, как его отдаёт Yandex Cloud: по месяцу с p_from по p_to,
-- count и share — строками. Пик — месяц p_peak ×p_mult, последние 3 месяца ряда ×p_growth.
CREATE FUNCTION pg_temp.dyn(p_from date, p_to date, p_base integer, p_peak integer DEFAULT 0,
                            p_mult numeric DEFAULT 1, p_growth numeric DEFAULT 1)
RETURNS text LANGUAGE sql AS $$
  SELECT jsonb_build_object('results', jsonb_agg(jsonb_build_object(
    'date', to_char(m, 'YYYY-MM-DD') || 'T00:00:00Z',
    'count', round(p_base * CASE WHEN extract(month FROM m)::integer = p_peak THEN p_mult ELSE 1 END
                          * CASE WHEN m > p_to - interval '3 months' THEN p_growth ELSE 1 END)::bigint::text,
    'share', '0.000123') ORDER BY m))::text
  FROM generate_series(p_from, p_to, interval '1 month') m
$$;

-- Подложить ответ на фразу запуска — тому запросу pg_net, что ушёл последним.
CREATE FUNCTION pg_temp.reply(p_run bigint, p_phrase text, p_status integer, p_content text,
                              p_headers jsonb DEFAULT NULL, p_timed_out boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_n integer;
BEGIN
  INSERT INTO net._http_response (id, status_code, content, headers, timed_out, created)
  SELECT j.request_id, p_status, p_content, p_headers, p_timed_out, now()
  FROM public.market_demand_yandex_jobs j WHERE j.run_id = p_run AND j.phrase = p_phrase AND j.status = 'sent';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'ПРОВАЛ: фраза «%» запуска % не в полёте — отвечать некому', p_phrase, p_run;
  END IF;
  RETURN v_n;
END $$;

CREATE FUNCTION pg_temp.job(p_run bigint, p_phrase text) RETURNS public.market_demand_yandex_jobs LANGUAGE sql AS $$
  SELECT * FROM public.market_demand_yandex_jobs WHERE run_id = p_run AND phrase = p_phrase
$$;

-- Месяцы — по Москве, как у Вордстата: прошлый — последний полный
SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '1 month')::date AS last_month,
       (date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '24 months')::date AS first_month,
       date_trunc('month', now() AT TIME ZONE 'Europe/Moscow')::date AS cur_month \gset

INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'yandex-admin@example.test') RETURNING id AS admin_id \gset

-- Чистый лист: только свои темы, без чисел, запусков и ключа
DELETE FROM public.market_demand_yandex_runs WHERE true;
DELETE FROM public.market_demand_yandex_monthly WHERE true;
DELETE FROM vault.secrets WHERE name = 'wordstat_api_key';
UPDATE public.market_demand_topics SET is_active = false WHERE is_active;

-- ── Права и расписание ──────────────────────────────────────────────────────
SELECT pg_temp.ok(NOT has_table_privilege('anon', 'public.market_demand_yandex_monthly', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.market_demand_yandex_runs', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.market_demand_yandex_jobs', 'INSERT')
                  AND (SELECT bool_and(relrowsecurity) FROM pg_class
                       WHERE oid IN ('public.market_demand_yandex_runs'::regclass, 'public.market_demand_yandex_jobs'::regclass,
                                     'public.market_demand_yandex_monthly'::regclass)),
                  'таблицы Вордстата закрыты от гостя и покупателя, RLS включён');
SELECT pg_temp.ok(NOT EXISTS (
                    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname LIKE 'market\_demand\_%'
                      AND (has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE')))
                  AND has_function_privilege('service_role', 'public.market_demand_yandex_request(uuid, boolean)', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.market_demand_yandex_progress()', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.market_demand_summary()', 'EXECUTE'),
                  'функции спроса — только service_role, и новая сводка тоже');
-- PostgREST грузит safeupdate: UPDATE/DELETE без WHERE там — ошибка, а в psql
-- (здесь) — нет. Поэтому проверка по телам функций
SELECT pg_temp.ok(NOT EXISTS (
  SELECT 1
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
       LATERAL regexp_matches(pg_get_functiondef(p.oid), '(?<!DO |FOR )\m(?:UPDATE|DELETE\s+FROM)\s+[a-z_][^;]*;', 'gi') AS m
  WHERE n.nspname = 'public' AND p.proname LIKE 'market\_demand\_%' AND m[1] !~* '\mWHERE\M'),
  'у каждого UPDATE/DELETE в функциях спроса есть WHERE (safeupdate в PostgREST)');
SELECT pg_temp.ok((SELECT count(*) FROM cron.job WHERE jobname = 'Market Demand Yandex Monthly' AND schedule = '40 4 5 * *'
                     AND command LIKE '%market_demand_yandex_request(NULL, true)%') = 1
                  AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Yandex Tick'),
                  'расписание: обновление 5-го в 04:40 UTC; тика в покое нет');

-- ── Фраза темы ──────────────────────────────────────────────────────────────
SELECT pg_temp.ok(public.market_demand_yandex_phrase(NULL, ARRAY['игрушки 3+', 'другое']) = 'игрушки 3'
                  AND public.market_demand_yandex_phrase(NULL, ARRAY['l.o.l -сюрприз']) = 'l o l сюрприз'
                  AND public.market_demand_yandex_phrase(NULL, ARRAY['человек-паук игрушка']) = 'человек-паук игрушка'
                  AND public.market_demand_yandex_phrase('машинки -стрижки', ARRAY['машинки']) = 'машинки -стрижки',
                  'фраза для Вордстата: своя, а без неё — первая без «+», «.» и минуса в начале слова');
INSERT INTO public.market_demand_topics (name, keywords, yandex_phrase)
VALUES ('ЯТ проверка', ARRAY['проверка'], '  Машинки   -Стрижки  ') RETURNING id AS check_id \gset
SELECT pg_temp.ok((SELECT yandex_phrase = 'машинки -стрижки' FROM public.market_demand_topics WHERE id = :'check_id'),
                  'своя фраза — строчными, без лишних пробелов');
UPDATE public.market_demand_topics SET yandex_phrase = '   ' WHERE id = :'check_id';
SELECT pg_temp.ok((SELECT yandex_phrase IS NULL FROM public.market_demand_topics WHERE id = :'check_id'),
                  'пустая своя фраза — NULL (тогда по первой фразе)');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.market_demand_topics SET yandex_phrase = 'кукла 🎎' WHERE name = 'ЯТ проверка'$q$)
                    LIKE '%только буквы, цифры, пробел и операторы%'
                  AND pg_temp.err($q$UPDATE public.market_demand_topics SET yandex_phrase = 'скидка 50%' WHERE name = 'ЯТ проверка'$q$)
                    LIKE '%только буквы%'
                  AND pg_temp.err($q$UPDATE public.market_demand_topics SET yandex_phrase = '-- !!' WHERE name = 'ЯТ проверка'$q$)
                    LIKE '%только буквы%'
                  AND pg_temp.err(format($q$UPDATE public.market_demand_topics SET yandex_phrase = %L WHERE name = 'ЯТ проверка'$q$, repeat('а', 121)))
                    LIKE '%длиннее 120%',
                  'своя фраза: эмодзи, «%», одни операторы, длиннее 120 — отказ');
UPDATE public.market_demand_topics SET yandex_phrase = '[из москвы] (роллы|пицца) !собаку +на "купить"' WHERE id = :'check_id';
SELECT pg_temp.ok((SELECT yandex_phrase = '[из москвы] (роллы|пицца) !собаку +на "купить"' FROM public.market_demand_topics WHERE id = :'check_id'),
                  'операторы Вордстата в своей фразе — можно');
DELETE FROM public.market_demand_topics WHERE id = :'check_id';

-- ── Ключ ────────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.err($q$SELECT public.market_demand_yandex_key_set('short', 'b1gfolder000000000000', '159', 'Казахстан', NULL)$q$)
                    LIKE '%API-ключ%'
                  AND pg_temp.err($q$SELECT public.market_demand_yandex_key_set('AQVN key with spaces 1234567', 'b1gfolder000000000000', '159', 'Казахстан', NULL)$q$)
                    LIKE '%API-ключ%'
                  AND pg_temp.err($q$SELECT public.market_demand_yandex_key_set('AQVNabcdefghijklmnopqrstuvwxyz', 'B1G Folder', '159', 'Казахстан', NULL)$q$)
                    LIKE '%ID каталога%'
                  AND pg_temp.err($q$SELECT public.market_demand_yandex_key_set('AQVNabcdefghijklmnopqrstuvwxyz', 'b1gfolder000000000000', 'kz', 'Казахстан', NULL)$q$)
                    LIKE '%Регион%',
                  'ключ: короткий, с пробелом, кривой каталог, регион не числом — отказ');
SELECT public.market_demand_yandex_key_set('AQVNfirstkey00000000000000000000', 'b1gfolder000000000000', '159', 'Казахстан', :'admin_id');
SELECT public.market_demand_yandex_key_set(' AQVNsecretkeyABCDEFGHIJKLMNOP9xyz ', ' b1gfolder000000000000 ', '159', 'Казахстан', :'admin_id');
SELECT pg_temp.ok((SELECT count(*) FROM vault.secrets WHERE name = 'wordstat_api_key') = 1
                  AND (SELECT folder_id = 'b1gfolder000000000000' AND key_last4 = '9xyz' AND region_id = '159' AND region_name = 'Казахстан'
                       FROM public.market_demand_yandex_key_status()),
                  'ключ в Vault один, обновляется на месте; наружу — каталог, 4 знака и регион');

-- ── Адрес API ───────────────────────────────────────────────────────────────
SELECT pg_temp.ok(public.market_demand_yandex_api_base() = 'https://searchapi.api.cloud.yandex.net', 'по умолчанию — настоящий Yandex Cloud');
SET LOCAL app.market_demand_yandex_api = 'https://evil.example.com';
SELECT pg_temp.ok(pg_temp.err('SELECT public.market_demand_yandex_api_base()') LIKE '%только локальная заглушка%',
                  'чужой адрес вместо Вордстата — отказ (ключ не уйдёт)');
SET LOCAL app.market_demand_yandex_api = '';

-- ── Темы для обновления ─────────────────────────────────────────────────────
-- Фразы с разных букв: порядок отправки (по алфавиту) одинаков при любой сортировке
INSERT INTO public.market_demand_topics (name, keywords, yandex_phrase, is_active) VALUES
  ('ЯТ1', ARRAY['а пазлы', 'пазлы детям'], NULL, true),
  ('ЯТ2', ARRAY['б игрушки 3+'], NULL, true),
  ('ЯТ3', ARRAY['в машинки'], 'в машинки -стрижки', true),
  ('ЯТ4', ARRAY['г фраза'], NULL, true),
  ('ЯТ5', ARRAY['д фраза'], NULL, true),
  ('ЯТ6', ARRAY['е фраза'], NULL, true),
  ('ЯТ7', ARRAY['ж свежая'], NULL, true),
  ('ЯТ8', ARRAY['а пазлы', 'другое'], NULL, true),
  ('ЯТ9', ARRAY['з неактивная'], NULL, false);
-- У «ж свежая» прошлый месяц уже есть; «старая фраза» — ничья
INSERT INTO public.market_demand_yandex_monthly (phrase, month, count)
SELECT 'ж свежая', m::date, 500 FROM generate_series(:'first_month'::date, :'last_month'::date, interval '1 month') m;
INSERT INTO public.market_demand_yandex_monthly (phrase, month, count) VALUES ('старая фраза', :'last_month', 7);

DELETE FROM vault.secrets WHERE name = 'wordstat_api_key';
SELECT pg_temp.ok(pg_temp.err($q$SELECT public.market_demand_yandex_request(NULL, false)$q$) LIKE '%Ключ Вордстата не задан%'
                  AND public.market_demand_yandex_request(NULL, true) ->> 'skipped' = 'ключ Вордстата не задан',
                  'без ключа: по кнопке — отказ, по расписанию — молча пропуск');
SELECT public.market_demand_yandex_key_set('AQVNsecretkeyABCDEFGHIJKLMNOP9xyz', 'b1gfolder000000000000', '159', 'Казахстан', :'admin_id');

-- ── Запуск 1: очередь, первый тик ───────────────────────────────────────────
SELECT (public.market_demand_yandex_request(:'admin_id') ->> 'run')::bigint AS run1 \gset
SELECT pg_temp.ok((SELECT status = 'pending' AND phrases = 6 AND NOT scheduled AND requested_by = :'admin_id'
                          AND api_base = 'https://searchapi.api.cloud.yandex.net'
                   FROM public.market_demand_yandex_runs WHERE id = :run1)
                  AND (SELECT array_agg(phrase ORDER BY phrase) FROM public.market_demand_yandex_jobs WHERE run_id = :run1)
                      = ARRAY['а пазлы', 'б игрушки 3', 'в машинки -стрижки', 'г фраза', 'д фраза', 'е фраза'],
                  'в очереди — фразы активных тем без прошлого месяца, по разу (без неактивной и свежей)');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.market_demand_yandex_monthly WHERE phrase = 'старая фраза')
                  AND EXISTS (SELECT 1 FROM public.market_demand_yandex_monthly WHERE phrase = 'ж свежая'),
                  'числа ничьей фразы убраны, свежие — на месте');
SELECT pg_temp.ok((SELECT count(*) FROM cron.job WHERE jobname = 'Market Demand Yandex Tick' AND schedule = '30 seconds'
                     AND command LIKE '%market_demand_yandex_tick()%') = 1,
                  'запуск поставил тик в расписание — раз в 30 секунд');
SELECT pg_temp.ok((SELECT array_agg(phrase ORDER BY phrase) FROM public.market_demand_yandex_jobs WHERE run_id = :run1 AND status = 'sent' AND attempts = 1)
                      = ARRAY['а пазлы', 'б игрушки 3', 'в машинки -стрижки', 'г фраза', 'д фраза']
                  AND (pg_temp.job(:run1, 'е фраза')).status = 'pending',
                  'первый тик — сразу: в полёте не больше 5, шестая ждёт');
SELECT q.url, q.method::text AS method, q.timeout_milliseconds AS tmo, q.headers, convert_from(q.body, 'UTF8')::jsonb AS body
FROM net.http_request_queue q WHERE q.id = (pg_temp.job(:run1, 'а пазлы')).request_id \gset q_
SELECT pg_temp.ok(:'q_url' = 'https://searchapi.api.cloud.yandex.net/v2/wordstat/dynamics' AND :'q_method' = 'POST' AND :q_tmo = 60000
                  AND :'q_headers'::jsonb ->> 'Authorization' = 'Api-Key AQVNsecretkeyABCDEFGHIJKLMNOP9xyz'
                  AND :'q_body'::jsonb = jsonb_build_object('folderId', 'b1gfolder000000000000', 'phrase', 'а пазлы',
                        'period', 'PERIOD_MONTHLY', 'fromDate', :'first_month' || 'T00:00:00Z',
                        'regions', jsonb_build_array('159'), 'devices', jsonb_build_array('DEVICE_ALL')),
                  'запрос: GetDynamics по месяцам за 24 полных месяца, Казахстан, Api-Key из Vault, каталог в теле');
SELECT pg_temp.ok(pg_temp.err($q$SELECT public.market_demand_yandex_request(NULL, false)$q$) LIKE '%уже идёт%'
                  AND public.market_demand_yandex_request(NULL, true) ->> 'skipped' = 'обновление уже идёт',
                  'второе обновление, пока идёт первое: по кнопке — отказ, по расписанию — пропуск');

-- ── Ответы: числа, квота, отказ фразы, сбой ─────────────────────────────────
SELECT pg_temp.reply(:run1, 'а пазлы', 200, pg_temp.dyn(:'first_month', :'cur_month', 1000, 12, 3, 1.5));
SELECT pg_temp.reply(:run1, 'б игрушки 3', 429, '{"code": 8, "message": "Quota limit exceeded"}', '{"Retry-After": "120"}');
SELECT pg_temp.reply(:run1, 'в машинки -стрижки', 400, '{"code": 3, "message": "Invalid phrase"}');
SELECT pg_temp.reply(:run1, 'г фраза', 500, 'Internal error');
SELECT public.market_demand_yandex_tick() AS t \gset
SELECT pg_temp.ok((:'t'::jsonb ->> 'received')::integer = 4 AND (:'t'::jsonb ->> 'sent')::integer = 0,
                  'тик забрал 4 ответа и на паузе ничего не отправил');
SELECT pg_temp.ok((pg_temp.job(:run1, 'а пазлы')).status = 'done'
                  AND (SELECT count(*) FROM public.market_demand_yandex_monthly WHERE phrase = 'а пазлы') = 24
                  AND NOT EXISTS (SELECT 1 FROM public.market_demand_yandex_monthly WHERE phrase = 'а пазлы' AND month = :'cur_month')
                  -- Прошлый месяц — в росте ×1,5 (и ×3, если это декабрь)
                  AND (SELECT count = 1500 * CASE WHEN extract(month FROM :'last_month'::date) = 12 THEN 3 ELSE 1 END
                              AND share = 0.000123
                       FROM public.market_demand_yandex_monthly WHERE phrase = 'а пазлы' AND month = :'last_month'),
                  '200: 24 месяца легли (count и share из строк), текущий неполный — нет');
SELECT pg_temp.ok((SELECT status = 'pending' AND next_at = now() + interval '120 seconds' AND attempts = 1
                   FROM pg_temp.job(:run1, 'б игрушки 3'))
                  AND (SELECT paused_until = now() + interval '120 seconds' FROM public.market_demand_yandex_runs WHERE id = :run1),
                  '429: фраза ждёт, весь запуск на паузе столько, сколько сказал Retry-After');
SELECT pg_temp.ok((SELECT status = 'failed' AND error = 'Вордстат не принял фразу: Invalid phrase' FROM pg_temp.job(:run1, 'в машинки -стрижки')),
                  '400: фраза в отказ с пояснением Yandex Cloud');
SELECT pg_temp.ok((SELECT status = 'pending' AND next_at = now() + interval '1 minute' AND error = 'Вордстат ответил 500'
                   FROM pg_temp.job(:run1, 'г фраза')),
                  '500: повтор через минуту');
SELECT pg_temp.ok((pg_temp.job(:run1, 'д фраза')).status = 'sent', 'без ответа — ждём дальше');

-- Пауза прошла
UPDATE public.market_demand_yandex_runs SET paused_until = now() - interval '1 second' WHERE id = :run1;
UPDATE public.market_demand_yandex_jobs SET next_at = now() - interval '1 second' WHERE run_id = :run1 AND status = 'pending';
SELECT public.market_demand_yandex_tick() AS t \gset
SELECT pg_temp.ok((:'t'::jsonb ->> 'sent')::integer = 3
                  AND (SELECT count(*) FROM public.market_demand_yandex_jobs WHERE run_id = :run1 AND status = 'sent') = 4
                  AND (pg_temp.job(:run1, 'б игрушки 3')).attempts = 2,
                  'после паузы: в полёт ушли три ждущие (вместе с висящей — 4 из 5)');

SELECT pg_temp.reply(:run1, 'б игрушки 3', 200, '{}');
SELECT pg_temp.reply(:run1, 'г фраза', NULL, NULL, NULL, true);
-- У «д» ряд кончается позапрошлым месяцем, у одного месяца нет count (protobuf опускает ноль)
SELECT pg_temp.reply(:run1, 'д фраза', 200, (
  SELECT jsonb_set(r::jsonb, '{results,0}', (r::jsonb #> '{results,0}') - 'count')::text
  FROM pg_temp.dyn(:'first_month', (:'last_month'::date - interval '1 month')::date, 300) r));
SELECT pg_temp.reply(:run1, 'е фраза', 200, pg_temp.dyn(:'first_month', :'last_month', 80));
SELECT public.market_demand_yandex_tick() AS t \gset
SELECT pg_temp.ok((pg_temp.job(:run1, 'б игрушки 3')).status = 'done'
                  AND NOT EXISTS (SELECT 1 FROM public.market_demand_yandex_monthly WHERE phrase = 'б игрушки 3'),
                  'пустой ответ {} (protobuf опускает пустое) — не ошибка, просто чисел нет');
SELECT pg_temp.ok((SELECT status = 'pending' AND attempts = 2 AND error = 'Вордстат не ответил за минуту'
                          AND next_at = now() + interval '2 minutes'
                   FROM pg_temp.job(:run1, 'г фраза')),
                  'таймаут: повтор, пауза растёт с попыткой');
SELECT pg_temp.ok((SELECT count = 0 FROM public.market_demand_yandex_monthly WHERE phrase = 'д фраза' AND month = :'first_month')
                  AND (SELECT count(*) FROM public.market_demand_yandex_monthly WHERE phrase = 'д фраза') = 23,
                  'месяц без count — ноль');

-- «г» исчерпала попытки
UPDATE public.market_demand_yandex_jobs SET attempts = 5, next_at = now() - interval '1 second' WHERE run_id = :run1 AND phrase = 'г фраза';
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.reply(:run1, 'г фраза', 503, '{"code": 14, "message": "Unavailable"}');
SELECT public.market_demand_yandex_tick() AS t \gset
SELECT pg_temp.ok((SELECT status = 'failed' AND error = 'Вордстат ответил 503: Unavailable' FROM pg_temp.job(:run1, 'г фраза')),
                  'сбой после 5 попыток — отказ с причиной');
SELECT pg_temp.ok((SELECT status = 'done' AND finished_at = now() AND paused_until IS NULL AND error IS NULL
                   FROM public.market_demand_yandex_runs WHERE id = :run1)
                  AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Yandex Tick'),
                  'запуск закрыт удачным (есть пришедшие фразы), тик снял себя с расписания');
SELECT public.market_demand_yandex_progress() AS p \gset
SELECT pg_temp.ok((:'p'::jsonb ->> 'month')::date = :'last_month' AND (:'p'::jsonb ->> 'phrases')::integer = 7
                  AND (:'p'::jsonb ->> 'stale')::integer = 4 AND (:'p'::jsonb ->> 'last_done_at') IS NOT NULL
                  AND (:'p'::jsonb #>> '{run,status}') = 'done' AND (:'p'::jsonb #>> '{run,done}')::integer = 4
                  AND (:'p'::jsonb #>> '{run,failed}')::integer = 2
                  AND (:'p'::jsonb #> '{run,failures}') = jsonb_build_array(
                        jsonb_build_object('phrase', 'в машинки -стрижки', 'error', 'Вордстат не принял фразу: Invalid phrase'),
                        jsonb_build_object('phrase', 'г фраза', 'error', 'Вордстат ответил 503: Unavailable')),
                  'для страницы: ждём прошлый месяц, без него 4 фразы из 7; итог запуска и отказы по фразам');

-- ── Сводка ──────────────────────────────────────────────────────────────────
SELECT * INTO TEMP sm FROM public.market_demand_summary();
SELECT pg_temp.ok((SELECT y_phrase = 'а пазлы' AND yandex_phrase IS NULL AND cardinality(y_series) = 24
                          AND y_series[1] = (SELECT count FROM public.market_demand_yandex_monthly WHERE phrase = 'а пазлы' AND month = :'first_month')
                          AND y_volume_last = (SELECT count FROM public.market_demand_yandex_monthly WHERE phrase = 'а пазлы' AND month = :'last_month')
                          AND y_data_until = :'last_month'
                          AND y_volume_avg3 = (SELECT round(avg(count))::integer FROM public.market_demand_yandex_monthly
                                               WHERE phrase = 'а пазлы' AND month > :'last_month'::date - interval '3 months')
                          AND y_peak_month = 12 AND y_peak_ratio > 1.3
                   FROM sm WHERE name = 'ЯТ1'),
                  'ЯТ1: ряд 24 месяца по своей фразе, последний, среднее за 3, пик в декабре');
SELECT pg_temp.ok((SELECT y_trend_pct = round((sum(m.count) FILTER (WHERE m.month > :'last_month'::date - interval '3 months')
                                                - sum(m.count) FILTER (WHERE m.month <= :'last_month'::date - interval '12 months'
                                                                        AND m.month > :'last_month'::date - interval '15 months')) * 100.0
                                               / sum(m.count) FILTER (WHERE m.month <= :'last_month'::date - interval '12 months'
                                                                       AND m.month > :'last_month'::date - interval '15 months'))::integer
                   FROM sm, public.market_demand_yandex_monthly m WHERE sm.name = 'ЯТ1' AND m.phrase = 'а пазлы'
                   GROUP BY sm.y_trend_pct),
                  'тренд — последние 3 месяца к тем же месяцам год назад');
SELECT pg_temp.ok((SELECT y_season_soon = ((12 - extract(month FROM now() AT TIME ZONE 'Asia/Almaty')::integer + 12) % 12 <= 2)
                   FROM sm WHERE name = 'ЯТ1'),
                  '«скоро сезон» — пик в этом месяце или в ближайшие два');
SELECT pg_temp.ok((SELECT y_series = (SELECT y_series FROM sm WHERE name = 'ЯТ1') FROM sm WHERE name = 'ЯТ8'),
                  'две темы с одной главной фразой — одни и те же числа');
SELECT pg_temp.ok((SELECT y_series IS NULL AND y_volume_avg3 IS NULL AND y_data_until IS NULL AND NOT y_season_soon
                   FROM sm WHERE name = 'ЯТ5')
                  AND (SELECT y_series IS NULL FROM sm WHERE name = 'ЯТ2')
                  AND (SELECT y_phrase = 'в машинки -стрижки' AND yandex_phrase = 'в машинки -стрижки' AND y_series IS NULL FROM sm WHERE name = 'ЯТ3'),
                  'ряд, не дошедший до последнего месяца, и тема без чисел — пусто, а не нули в конце');
DROP TABLE sm;

-- ── Запуск 2: ключ не подошёл ───────────────────────────────────────────────
SET LOCAL app.market_demand_yandex_api = 'http://host.docker.internal:8791';
SELECT (public.market_demand_yandex_request(:'admin_id') ->> 'run')::bigint AS run2 \gset
SET LOCAL app.market_demand_yandex_api = '';
SELECT pg_temp.ok((SELECT phrases = 4 AND api_base = 'http://host.docker.internal:8791' FROM public.market_demand_yandex_runs WHERE id = :run2)
                  AND (SELECT array_agg(phrase ORDER BY phrase) FROM public.market_demand_yandex_jobs WHERE run_id = :run2)
                      = ARRAY['б игрушки 3', 'в машинки -стрижки', 'г фраза', 'д фраза']
                  AND (SELECT url FROM net.http_request_queue WHERE id = (pg_temp.job(:run2, 'г фраза')).request_id)
                      = 'http://host.docker.internal:8791/v2/wordstat/dynamics',
                  'повтор берёт только несвежие фразы; адрес API запомнен в запуске — тик ходит туда же');
SELECT pg_temp.reply(:run2, 'б игрушки 3', 401, '{"code": 16, "message": "Unknown api key"}');
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT status = 'failed' AND error = 'Yandex Cloud не принял API-ключ — задайте ключ заново (Unknown api key)'
                   FROM public.market_demand_yandex_runs WHERE id = :run2)
                  AND (SELECT bool_and(status = 'failed') FROM public.market_demand_yandex_jobs WHERE run_id = :run2)
                  AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Yandex Tick'),
                  '401: весь запуск в отказ с понятной причиной, тик снят');

-- ── Запуск 3: ответ потерялся, ключ удалили, не успели за 12 часов ─────────
SELECT (public.market_demand_yandex_request(:'admin_id') ->> 'run')::bigint AS run3 \gset
UPDATE public.market_demand_yandex_jobs SET sent_at = now() - interval '31 minutes' WHERE run_id = :run3 AND phrase = 'б игрушки 3';
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT status = 'pending' AND error = 'Ответа от Вордстата нет' FROM pg_temp.job(:run3, 'б игрушки 3')),
                  'ответа нет 30 минут — повтор');
SELECT public.market_demand_yandex_key_delete();
UPDATE public.market_demand_yandex_jobs SET next_at = now() - interval '1 second' WHERE run_id = :run3 AND status = 'pending';
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT status = 'failed' AND error = 'Ключ Вордстата удалён' FROM pg_temp.job(:run3, 'б игрушки 3'))
                  AND (SELECT status FROM public.market_demand_yandex_runs WHERE id = :run3) = 'pending',
                  'ключ удалили: ждущее — в отказ, ушедшее ещё ждём');
UPDATE public.market_demand_yandex_runs SET requested_at = now() - interval '13 hours' WHERE id = :run3;
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT status = 'failed' FROM public.market_demand_yandex_runs WHERE id = :run3)
                  AND (SELECT count(*) FROM public.market_demand_yandex_jobs WHERE run_id = :run3 AND error = 'Не успели за 12 часов — квота Вордстата') = 3
                  AND NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Market Demand Yandex Tick'),
                  'старше 12 часов — остаток в отказ, запуск закрыт, тик снят');

-- ── Запуск 4: квота за час, 429 двадцать раз ────────────────────────────────
SELECT public.market_demand_yandex_key_set('AQVNsecretkeyABCDEFGHIJKLMNOP9xyz', 'b1gfolder000000000000', '159', 'Казахстан', :'admin_id');
-- За последний час уже ушло 95 запросов (чужой запуск)
INSERT INTO public.market_demand_yandex_runs (status, api_base, phrases, requested_at, finished_at)
VALUES ('done', 'https://searchapi.api.cloud.yandex.net', 95, now() - interval '20 minutes', now() - interval '5 minutes')
RETURNING id AS busy_run \gset
INSERT INTO public.market_demand_yandex_jobs (run_id, phrase, status, attempts, sent_at, finished_at)
SELECT :busy_run, 'занято ' || i, 'done', 1, now() - interval '10 minutes', now() - interval '9 minutes' FROM generate_series(1, 95) i;
SELECT (public.market_demand_yandex_request(:'admin_id') ->> 'run')::bigint AS run4 \gset
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.market_demand_yandex_jobs WHERE run_id = :run4 AND status <> 'pending'),
                  '95 запросов за час уже ушло — новых не шлём (квота 100)');
UPDATE public.market_demand_yandex_jobs SET sent_at = now() - interval '61 minutes' WHERE run_id = :busy_run;
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT count(*) FROM public.market_demand_yandex_jobs WHERE run_id = :run4 AND status = 'sent') = 4,
                  'час прошёл — снова шлём');
UPDATE public.market_demand_yandex_jobs SET attempts = 20 WHERE run_id = :run4 AND phrase = 'б игрушки 3';
SELECT pg_temp.reply(:run4, 'б игрушки 3', 429, '{"code": 8, "message": "Quota limit exceeded"}');
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT status = 'failed' AND error LIKE 'Квота Вордстата кончалась 20 раз подряд%' FROM pg_temp.job(:run4, 'б игрушки 3'))
                  AND (SELECT paused_until IS NULL FROM public.market_demand_yandex_runs WHERE id = :run4),
                  '429 в двадцатый раз — фраза в отказ, без новой паузы');
-- Остальное пришло: 200 по всем, «в» и «г» — полный ряд
SELECT pg_temp.reply(:run4, 'в машинки -стрижки', 200, pg_temp.dyn(:'first_month', :'last_month', 40));
SELECT pg_temp.reply(:run4, 'г фраза', 200, pg_temp.dyn(:'first_month', :'last_month', 60));
SELECT pg_temp.reply(:run4, 'д фраза', 200, pg_temp.dyn(:'first_month', :'last_month', 300));
SELECT public.market_demand_yandex_tick();
SELECT pg_temp.ok((SELECT status FROM public.market_demand_yandex_runs WHERE id = :run4) = 'done'
                  AND (SELECT y_volume_avg3 = 300 FROM public.market_demand_summary() WHERE name = 'ЯТ5'),
                  'запуск 4 закрыт; у «д» теперь полный ряд — и он в сводке');

-- ── Всё свежее ──────────────────────────────────────────────────────────────
INSERT INTO public.market_demand_yandex_monthly (phrase, month, count) VALUES ('б игрушки 3', :'last_month', 0);
SELECT pg_temp.ok((public.market_demand_yandex_progress() ->> 'stale')::integer = 0
                  AND pg_temp.err($q$SELECT public.market_demand_yandex_request(NULL, false)$q$) LIKE 'Числа Вордстата уже свежие: %есть по всем темам'
                  AND public.market_demand_yandex_request(NULL, true) ->> 'skipped' = 'всё свежее',
                  'всё свежее: по кнопке — понятный отказ (платить не за что), по расписанию — пропуск');

-- ── Регион ──────────────────────────────────────────────────────────────────
SELECT public.market_demand_yandex_key_set('AQVNanotherkey0000000000000000000', 'b1gfolder000000000000', '159', 'Казахстан', :'admin_id');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.market_demand_yandex_monthly), 'новый ключ на тот же регион — числа на месте');
SELECT public.market_demand_yandex_key_set('AQVNanotherkey0000000000000000000', 'b1gfolder000000000000', '162', 'Алматы', :'admin_id');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.market_demand_yandex_monthly), 'регион сменился — прежние числа стёрты');

ROLLBACK;
