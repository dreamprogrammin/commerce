-- ============================================================================
-- Спрос на рынке: второй источник — Яндекс Вордстат.
--
-- Зачем (2 ноября 2026). Владелец: «оставляем DataForSEO на пробном балансе и
-- еще подключаем туда яндекс». В Казахстане у Яндекса около трети поиска, у
-- Google — две трети (StatCounter, 2026): Google остаётся основным, Вордстат
-- идёт рядом своими числами. Складывать их нельзя — считают по-разному.
--
-- Откуда числа. Бесплатный API Вордстата по заявке (api.wordstat.yandex.net)
-- Яндекс закрыл: «Все возможности API Вордстата теперь доступны в Wordstat API
-- сервиса Yandex Search API». Теперь это Yandex Cloud: сервисный аккаунт с
-- ролью search-api.webSearch.user, его API-ключ (область yc.search-api.execute)
-- и ID каталога. Цена на ноябрь 2026, с НДС: динамика (GetDynamics) — 100 ₸ за
-- 1000 запросов, то есть 0,1 ₸ за тему, все 92 темы — около 9 ₸. Дерево
-- регионов бесплатно. Квота по умолчанию — 10 запросов в секунду и 100 в час.
--
-- Как устроено:
--   * фраза темы для Вордстата — market_demand_topics.yandex_phrase, а если
--     пусто — первая фраза темы. Без операторов Вордстат считает все запросы
--     с этими словами в любой форме, так что одна главная фраза — это весь
--     спрос темы. Лишнее убирается «-словом»: «машинки -стрижки»;
--   * ключ — API-ключ, каталог и номер региона «Казахстан» — лежит в Vault и
--     задаётся в админке, браузеру не возвращается. Сервер админки проверяет
--     ключ бесплатным GetRegionsTree и там же находит регион;
--   * обновление — запуск (market_demand_yandex_runs), в нём по задаче на
--     фразу (market_demand_yandex_jobs). Запросы уходят через pg_net понемногу:
--     тик раз в 30 секунд, в полёте не больше 5, за час не больше 95 (квота —
--     100). Тик ставит в расписание сам запуск, снимает последний тик — в
--     спокойное время его в расписании нет. Ответ «квота кончилась» (429) —
--     пауза, потом дальше;
--   * спрашиваются только фразы без прошлого месяца: повторное нажатие ничего
--     не стоит, а 5-го числа плановое обновление берёт все;
--   * ответ — числа по месяцам за 24 месяца в market_demand_yandex_monthly;
--     market_demand_summary() отдаёт их рядом с Google (поля y_*);
--   * всё закрыто RLS без политик, функции — только service_role;
--   * у каждого изменения строк в функциях — WHERE: сессии PostgREST грузят
--     safeupdate.
--
-- Проверка — supabase/tests/test_market_demand_yandex.sql.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.market_demand_topics') IS NULL THEN
    RAISE EXCEPTION 'нет спроса рынка — сначала 20261101120000_market_demand';
  END IF;
  IF to_regclass('public.market_demand_yandex_runs') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'market\_demand\_yandex%')
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'market_demand_topics' AND column_name = 'yandex_phrase') THEN
    RAISE EXCEPTION 'Вордстат уже заведён — миграция применялась?';
  END IF;
  -- Сводка — ровно та, что на бою с 1.11.2026: её тело ниже взято оттуда
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'market_demand_summary') <> 1
     OR (SELECT md5(prosrc) FROM pg_proc WHERE oid = to_regprocedure('public.market_demand_summary()'))
        IS DISTINCT FROM '57a08a6175008092874706d009442636' THEN
    RAISE EXCEPTION 'market_demand_summary не та, что на бою 1.11.2026 — сверить тело перед заменой';
  END IF;
  IF to_regclass('net._http_response') IS NULL
     OR to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION 'нет pg_net с net.http_post(url, body, params, headers, timeout)';
  END IF;
  -- Тик раз в 30 секунд: расписание в секундах есть с pg_cron 1.5
  IF coalesce(string_to_array((SELECT extversion FROM pg_extension WHERE extname = 'pg_cron'), '.')::integer[], '{0}')
     < '{1,5}' THEN
    RAISE EXCEPTION 'нужен pg_cron 1.5 или новее';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname LIKE 'Market Demand Yandex%') THEN
    RAISE EXCEPTION 'задания Вордстата в расписании уже есть';
  END IF;
END $$;

-- ── 1. Фраза темы для Вордстата ─────────────────────────────────────────────
ALTER TABLE public.market_demand_topics ADD COLUMN yandex_phrase text;
COMMENT ON COLUMN public.market_demand_topics.yandex_phrase IS
  'Фраза для Вордстата, можно с операторами («машинки -стрижки»); NULL — первая фраза темы';

/*
 * Своя фраза для Вордстата: строчными, одиночные пробелы, до 120 знаков;
 * буквы, цифры и операторы Вордстата « - ! + " ( ) | [ ] ». Пустая — NULL,
 * тогда тема считается по первой фразе.
 */
CREATE FUNCTION public.market_demand_topics_yandex()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.yandex_phrase := nullif(lower(btrim(regexp_replace(NEW.yandex_phrase, '\s+', ' ', 'g'))), '');
  IF NEW.yandex_phrase IS NOT NULL THEN
    IF length(NEW.yandex_phrase) > 120 THEN
      RAISE EXCEPTION 'Фраза для Вордстата длиннее 120 знаков';
    END IF;
    IF NEW.yandex_phrase !~ '^[]a-z0-9а-яёәғқңөұүһі !+"()|[-]+$' OR NEW.yandex_phrase !~ '[a-z0-9а-яёәғқңөұүһі]' THEN
      RAISE EXCEPTION 'Фраза для Вордстата «%»: только буквы, цифры, пробел и операторы « - ! + " ( ) | [ ] »',
        NEW.yandex_phrase;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- После market_demand_topics_normalize: триггеры идут по имени
CREATE TRIGGER market_demand_topics_yandex
  BEFORE INSERT OR UPDATE ON public.market_demand_topics
  FOR EACH ROW EXECUTE FUNCTION public.market_demand_topics_yandex();

/*
 * Фраза, по которой тема спрашивается у Вордстата и под которой лежат её
 * числа. Без своей — первая фраза темы без знаков, которые Вордстат читает как
 * операторы («+», «-» в начале слова) или не понимает («.», «'», «&»).
 */
CREATE FUNCTION public.market_demand_yandex_phrase(p_override text, p_keywords text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT coalesce(nullif(p_override, ''),
    nullif(btrim(regexp_replace(regexp_replace(regexp_replace(p_keywords[1], '[.''&+]', ' ', 'g'),
                                               '(^|\s)-+', '\1', 'g'), '\s+', ' ', 'g')), ''))
$$;

-- ── 2. Таблицы ──────────────────────────────────────────────────────────────
-- Обновление. Адрес API — тот, что был при запуске: тик идёт из расписания, а
-- там настройки сессии страницы не видно
CREATE TABLE public.market_demand_yandex_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  scheduled boolean NOT NULL DEFAULT false,
  api_base text NOT NULL,
  phrases integer NOT NULL CHECK (phrases > 0),
  -- После ответа «квота кончилась» не слать до этого времени
  paused_until timestamptz,
  error text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE public.market_demand_yandex_jobs (
  run_id bigint NOT NULL REFERENCES public.market_demand_yandex_runs(id) ON DELETE CASCADE,
  phrase text NOT NULL,
  -- pending — ждёт очереди; sent — ушла в pg_net, ждём ответ
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'done', 'failed')),
  attempts smallint NOT NULL DEFAULT 0,
  next_at timestamptz NOT NULL DEFAULT now(),
  -- Номер запроса pg_net: по нему ответ ищется в net._http_response
  request_id bigint,
  sent_at timestamptz,
  error text,
  finished_at timestamptz,
  PRIMARY KEY (run_id, phrase)
);

-- Сколько раз за месяц в Яндексе в Казахстане искали со словами фразы
CREATE TABLE public.market_demand_yandex_monthly (
  phrase text NOT NULL,
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  count bigint NOT NULL CHECK (count >= 0),
  -- Доля от всех запросов Яндекса, как её отдаёт Вордстат
  share numeric,
  PRIMARY KEY (phrase, month)
);

ALTER TABLE public.market_demand_yandex_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_demand_yandex_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_demand_yandex_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_demand_yandex_runs, public.market_demand_yandex_jobs, public.market_demand_yandex_monthly
  FROM anon, authenticated;
GRANT ALL ON public.market_demand_yandex_runs, public.market_demand_yandex_jobs, public.market_demand_yandex_monthly
  TO service_role;

-- ── 3. Ключ Yandex Cloud ────────────────────────────────────────────────────
/*
 * API-ключ сервисного аккаунта, ID каталога и регион, найденный сервером
 * админки в дереве регионов Вордстата (бесплатным GetRegionsTree им же
 * проверен и ключ). Браузеру — только каталог, 4 последних знака и регион.
 * Регион сменился — прежние числа были про другой, они стираются.
 */
CREATE FUNCTION public.market_demand_yandex_key_set(p_api_key text, p_folder_id text, p_region_id text,
  p_region_name text, p_admin uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_key text := btrim(p_api_key);
  v_folder text := btrim(p_folder_id);
  v_region text := btrim(p_region_id);
  v_name text := btrim(p_region_name);
  v_value text;
  v_desc text := format('Ключ Вордстата (Yandex Cloud), задан администратором %s', p_admin);
  v_id uuid;
  v_old_region text;
BEGIN
  IF v_key IS NULL OR length(v_key) NOT BETWEEN 20 AND 300 OR v_key ~ '\s' THEN
    RAISE EXCEPTION 'API-ключ Yandex Cloud пустой, короткий или с пробелом';
  END IF;
  IF v_folder IS NULL OR v_folder !~ '^[a-z0-9]{8,50}$' THEN
    RAISE EXCEPTION 'ID каталога Yandex Cloud — строчные латинские буквы и цифры, как b1g…';
  END IF;
  IF v_region IS NULL OR v_region !~ '^[0-9]{1,10}$' OR coalesce(v_name, '') = '' OR length(v_name) > 100 THEN
    RAISE EXCEPTION 'Регион Вордстата не задан';
  END IF;
  v_value := jsonb_build_object('api_key', v_key, 'folder_id', v_folder, 'region_id', v_region, 'region_name', v_name)::text;

  SELECT id, decrypted_secret::jsonb ->> 'region_id' INTO v_id, v_old_region
  FROM vault.decrypted_secrets WHERE name = 'wordstat_api_key';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_value, 'wordstat_api_key', v_desc);
  ELSE
    PERFORM vault.update_secret(v_id, v_value, 'wordstat_api_key', v_desc);
  END IF;
  IF v_old_region IS NOT NULL AND v_old_region <> v_region THEN
    DELETE FROM public.market_demand_yandex_monthly WHERE true;
  END IF;
END $$;

CREATE FUNCTION public.market_demand_yandex_key_delete()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'wordstat_api_key';
$$;

CREATE FUNCTION public.market_demand_yandex_key_status()
RETURNS TABLE (folder_id text, key_last4 text, region_id text, region_name text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT v ->> 'folder_id', right(v ->> 'api_key', 4), v ->> 'region_id', v ->> 'region_name', s.updated_at
  FROM (SELECT decrypted_secret::jsonb AS v, updated_at FROM vault.decrypted_secrets WHERE name = 'wordstat_api_key') s;
$$;

-- ── 4. Обновление ───────────────────────────────────────────────────────────
/*
 * Адрес API. Для проверки — локальная заглушка через
 * app.market_demand_yandex_api (только localhost / host.docker.internal:
 * иначе настройка увела бы ключ на чужой сервер).
 */
CREATE FUNCTION public.market_demand_yandex_api_base()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_url text := nullif(current_setting('app.market_demand_yandex_api', true), '');
BEGIN
  IF v_url IS NULL THEN
    RETURN 'https://searchapi.api.cloud.yandex.net';
  END IF;
  IF v_url !~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{2,5})?$' THEN
    RAISE EXCEPTION 'app.market_demand_yandex_api — только локальная заглушка';
  END IF;
  RETURN v_url;
END $$;

/*
 * Ответ Вордстата на фразу. p_error — сбой сети или таймаут (тела нет).
 * Возвращает, что стало с задачей: done, failed или pending (повторим позже).
 * Отдельно от тика — чтобы проверять разбор на готовых ответах, без сети.
 *
 * Ответы Yandex Cloud — JSON по правилам protobuf: пустые поля опускаются.
 * Поэтому нет «results» — нет чисел (не ошибка), нет «count» — ноль.
 */
CREATE FUNCTION public.market_demand_yandex_ingest(p_run_id bigint, p_phrase text, p_http_status integer,
  p_content text, p_headers jsonb DEFAULT NULL, p_error text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_job market_demand_yandex_jobs;
  v_body jsonb;
  v_results jsonb;
  v_message text;
  v_retry_after text;
  v_wait integer;
  v_status text;
  -- Вордстат считает месяцы по Москве; текущий ещё не закончился
  v_current date := date_trunc('month', now() AT TIME ZONE 'Europe/Moscow')::date;
BEGIN
  SELECT * INTO v_job FROM market_demand_yandex_jobs WHERE run_id = p_run_id AND phrase = p_phrase FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Нет задачи Вордстата % «%»', p_run_id, p_phrase;
  END IF;
  IF v_job.status IN ('done', 'failed') THEN
    RETURN v_job.status;
  END IF;

  BEGIN
    v_body := p_content::jsonb;
  EXCEPTION WHEN others THEN
    v_body := NULL;
  END;
  -- Пояснение Yandex Cloud: {"code": …, "message": …}
  IF jsonb_typeof(v_body) = 'object' THEN
    v_message := left(coalesce(v_body ->> 'message', v_body -> 'error' ->> 'message'), 300);
  END IF;

  IF p_error IS NULL AND p_http_status = 200 THEN
    v_results := CASE WHEN jsonb_typeof(v_body) = 'object'
                      THEN coalesce(v_body -> 'results', v_body -> 'dynamics', '[]'::jsonb) END;
    IF jsonb_typeof(v_results) IS DISTINCT FROM 'array' THEN
      v_status := 'failed';
      v_message := 'Вордстат ответил не так, как ждали: нет чисел по месяцам';
    ELSE
      BEGIN
        -- Текущий месяц не берём: неполный, он притворился бы падением спроса
        INSERT INTO market_demand_yandex_monthly AS m (phrase, month, count, share)
        SELECT DISTINCT ON (s.month) p_phrase, s.month, s.count, s.share
        FROM (
          SELECT date_trunc('month', (e ->> 'date')::timestamptz AT TIME ZONE 'Europe/Moscow')::date AS month,
                 coalesce(e ->> 'count', '0')::bigint AS count,
                 (e ->> 'share')::numeric AS share
          FROM jsonb_array_elements(v_results) e
          WHERE jsonb_typeof(e) = 'object'
            AND (e ->> 'date') ~ '^\d{4}-\d{2}-\d{2}'
            AND coalesce(e ->> 'count', '0') ~ '^\d{1,15}$'
        ) s
        WHERE s.month < v_current
        ORDER BY s.month
        ON CONFLICT (phrase, month) DO UPDATE SET count = EXCLUDED.count, share = EXCLUDED.share;
        v_status := 'done';
      EXCEPTION WHEN others THEN
        v_status := 'failed';
        v_message := 'Ответ Вордстата не разобрать: ' || SQLERRM;
      END;
    END IF;
    UPDATE market_demand_yandex_jobs
    SET status = v_status, error = CASE WHEN v_status = 'failed' THEN v_message END, finished_at = now()
    WHERE run_id = p_run_id AND phrase = p_phrase;

  ELSIF p_error IS NULL AND p_http_status = 429 THEN
    -- Квота: 100 запросов в час. Пауза всему запуску — сколько скажут, иначе 10 минут
    v_retry_after := coalesce(p_headers ->> 'Retry-After', p_headers ->> 'retry-after');
    v_wait := least(greatest(CASE WHEN v_retry_after ~ '^\d{1,6}$' THEN v_retry_after::integer ELSE 600 END, 30), 3600);
    IF v_job.attempts >= 20 THEN
      v_status := 'failed';
      UPDATE market_demand_yandex_jobs
      SET status = 'failed', finished_at = now(),
          error = 'Квота Вордстата кончалась 20 раз подряд — фраза придёт со следующим обновлением'
      WHERE run_id = p_run_id AND phrase = p_phrase;
    ELSE
      v_status := 'pending';
      UPDATE market_demand_yandex_jobs
      SET status = 'pending', next_at = now() + make_interval(secs => v_wait), error = 'квота Вордстата — пауза'
      WHERE run_id = p_run_id AND phrase = p_phrase;
      UPDATE market_demand_yandex_runs
      SET paused_until = greatest(coalesce(paused_until, now()), now() + make_interval(secs => v_wait))
      WHERE id = p_run_id;
    END IF;

  ELSIF p_error IS NULL AND p_http_status IN (401, 403) THEN
    -- Ключ не подходит — дальше спрашивать бессмысленно, весь запуск стоп
    v_status := 'failed';
    v_message := CASE p_http_status
      WHEN 401 THEN 'Yandex Cloud не принял API-ключ — задайте ключ заново'
      ELSE 'Нет доступа к Вордстату: у сервисного аккаунта нет роли search-api.webSearch.user в каталоге'
           || ' или не активен платёжный аккаунт Yandex Cloud'
    END || coalesce(' (' || v_message || ')', '');
    UPDATE market_demand_yandex_jobs
    SET status = 'failed', error = v_message, finished_at = now()
    WHERE run_id = p_run_id AND status IN ('pending', 'sent');
    UPDATE market_demand_yandex_runs SET error = v_message WHERE id = p_run_id;

  ELSIF p_error IS NULL AND p_http_status IN (400, 404) THEN
    v_status := 'failed';
    UPDATE market_demand_yandex_jobs
    SET status = 'failed', finished_at = now(),
        error = 'Вордстат не принял фразу: ' || coalesce(v_message, 'HTTP ' || p_http_status)
    WHERE run_id = p_run_id AND phrase = p_phrase;

  ELSE
    -- Сеть, таймаут, 5xx: ещё раз чуть позже, до 5 попыток
    v_message := coalesce(p_error, format('Вордстат ответил %s', coalesce(p_http_status::text, 'без кода'))
                                   || coalesce(': ' || v_message, ''));
    IF v_job.attempts >= 5 THEN
      v_status := 'failed';
      UPDATE market_demand_yandex_jobs
      SET status = 'failed', error = v_message, finished_at = now()
      WHERE run_id = p_run_id AND phrase = p_phrase;
    ELSE
      v_status := 'pending';
      UPDATE market_demand_yandex_jobs
      SET status = 'pending', error = v_message, next_at = now() + make_interval(mins => greatest(v_job.attempts, 1))
      WHERE run_id = p_run_id AND phrase = p_phrase;
    END IF;
  END IF;

  PERFORM market_demand_yandex_finish(p_run_id);
  RETURN v_status;
END $$;

/*
 * Закрыть запуск, если в очереди и в полёте ничего не осталось: удачный —
 * если пришла хоть одна фраза, иначе неудачный с причиной первой отказавшей.
 */
CREATE FUNCTION public.market_demand_yandex_finish(p_run_id bigint)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_status text;
BEGIN
  IF EXISTS (SELECT 1 FROM market_demand_yandex_jobs WHERE run_id = p_run_id AND status IN ('pending', 'sent')) THEN
    RETURN 'pending';
  END IF;
  UPDATE market_demand_yandex_runs r
  SET status = CASE WHEN x.got THEN 'done' ELSE 'failed' END,
      error = coalesce(r.error, CASE WHEN NOT x.got THEN coalesce(x.first_error, 'Ни одной фразы не получено') END),
      paused_until = NULL,
      finished_at = now()
  FROM (
    SELECT bool_or(j.status = 'done') AS got,
           (array_agg(j.error ORDER BY j.finished_at, j.phrase) FILTER (WHERE j.status = 'failed'))[1] AS first_error
    FROM market_demand_yandex_jobs j WHERE j.run_id = p_run_id
  ) x
  WHERE r.id = p_run_id AND r.status = 'pending'
  RETURNING r.status INTO v_status;
  RETURN coalesce(v_status, (SELECT status FROM market_demand_yandex_runs WHERE id = p_run_id));
END $$;

/*
 * Тик очереди: забрать пришедшие ответы, отправить следующие фразы, закрыть
 * законченные запуски. Пока есть незаконченный запуск, расписание зовёт тик
 * раз в 30 секунд; когда нет — тик снимает себя с расписания.
 *
 * Темп — под квоту Вордстата (10 в секунду, 100 в час): в полёте не больше 5
 * запросов, за час — не больше 95. Ответ pg_net порой виден через несколько
 * минут (1.11.2026 бывало и 6), поэтому «ответа нет» — только через 30 минут.
 */
CREATE FUNCTION public.market_demand_yandex_tick()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  c_in_flight CONSTANT integer := 5;
  c_per_hour CONSTANT integer := 95;
  v_job record;
  v_resp record;
  v_key jsonb;
  v_slots integer;
  v_from text;
  v_got integer := 0;
  v_sent integer := 0;
BEGIN
  -- Тик один: расписание и запрос со страницы не разбирают одно дважды
  IF NOT pg_try_advisory_xact_lock(hashtext('market_demand_yandex')) THEN
    RETURN jsonb_build_object('busy', true);
  END IF;

  -- 1. Пришедшие ответы
  FOR v_job IN SELECT run_id, phrase, request_id, sent_at FROM market_demand_yandex_jobs
               WHERE status = 'sent' ORDER BY sent_at LOOP
    SELECT status_code, content, headers, timed_out, error_msg INTO v_resp
    FROM net._http_response WHERE id = v_job.request_id;
    IF FOUND THEN
      PERFORM market_demand_yandex_ingest(v_job.run_id, v_job.phrase, v_resp.status_code, v_resp.content, v_resp.headers,
        CASE WHEN v_resp.timed_out THEN 'Вордстат не ответил за минуту'
             WHEN v_resp.error_msg IS NOT NULL THEN 'Сбой связи с Вордстатом: ' || v_resp.error_msg END);
      v_got := v_got + 1;
    ELSIF v_job.sent_at < now() - interval '30 minutes' THEN
      PERFORM market_demand_yandex_ingest(v_job.run_id, v_job.phrase, NULL, NULL, NULL, 'Ответа от Вордстата нет');
      v_got := v_got + 1;
    END IF;
  END LOOP;

  -- 2. Не уложились в 12 часов — квота кончалась раз за разом
  FOR v_job IN SELECT id FROM market_demand_yandex_runs
               WHERE status = 'pending' AND requested_at < now() - interval '12 hours' LOOP
    UPDATE market_demand_yandex_jobs
    SET status = 'failed', error = 'Не успели за 12 часов — квота Вордстата', finished_at = now()
    WHERE run_id = v_job.id AND status IN ('pending', 'sent');
    PERFORM market_demand_yandex_finish(v_job.id);
  END LOOP;

  -- 3. Отправка
  IF EXISTS (SELECT 1 FROM market_demand_yandex_runs WHERE status = 'pending') THEN
    SELECT decrypted_secret::jsonb INTO v_key FROM vault.decrypted_secrets WHERE name = 'wordstat_api_key';
    IF v_key IS NULL THEN
      -- Ключ удалили посреди обновления: ждущее — в отказ, ушедшее дождёмся
      FOR v_job IN SELECT id FROM market_demand_yandex_runs WHERE status = 'pending' LOOP
        UPDATE market_demand_yandex_jobs
        SET status = 'failed', error = 'Ключ Вордстата удалён', finished_at = now()
        WHERE run_id = v_job.id AND status = 'pending';
        PERFORM market_demand_yandex_finish(v_job.id);
      END LOOP;
    ELSE
      v_slots := least(
        c_in_flight - (SELECT count(*) FROM market_demand_yandex_jobs WHERE status = 'sent'),
        c_per_hour - (SELECT count(*) FROM market_demand_yandex_jobs WHERE sent_at > now() - interval '1 hour'));
      -- 24 полных месяца: с первого числа того же месяца два года назад (по Москве)
      v_from := to_char(date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '24 months', 'YYYY-MM-DD')
                || 'T00:00:00Z';
      FOR v_job IN
        SELECT j.run_id, j.phrase, r.api_base
        FROM market_demand_yandex_jobs j
        JOIN market_demand_yandex_runs r ON r.id = j.run_id
        WHERE j.status = 'pending' AND j.next_at <= now()
          AND r.status = 'pending' AND (r.paused_until IS NULL OR r.paused_until <= now())
        ORDER BY j.run_id, j.attempts, j.phrase
        LIMIT greatest(v_slots, 0)
      LOOP
        UPDATE market_demand_yandex_jobs
        SET status = 'sent', attempts = attempts + 1, sent_at = now(), request_id = net.http_post(
              url := v_job.api_base || '/v2/wordstat/dynamics',
              body := jsonb_build_object(
                'folderId', v_key ->> 'folder_id',
                'phrase', v_job.phrase,
                'period', 'PERIOD_MONTHLY',
                'fromDate', v_from,
                'regions', jsonb_build_array(v_key ->> 'region_id'),
                'devices', jsonb_build_array('DEVICE_ALL')),
              headers := jsonb_build_object('Authorization', 'Api-Key ' || (v_key ->> 'api_key'),
                                            'Content-Type', 'application/json'),
              timeout_milliseconds := 60000)
        WHERE run_id = v_job.run_id AND phrase = v_job.phrase;
        v_sent := v_sent + 1;
      END LOOP;
    END IF;
  END IF;

  -- 4. Очередь пуста — тик больше не нужен
  IF NOT EXISTS (SELECT 1 FROM market_demand_yandex_runs WHERE status = 'pending') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'Market Demand Yandex Tick';
  END IF;

  RETURN jsonb_build_object('received', v_got, 'sent', v_sent,
    'waiting', (SELECT count(*) FROM market_demand_yandex_jobs WHERE status IN ('pending', 'sent')));
END $$;

/*
 * Обновить Вордстат: фразы активных тем, у которых нет прошлого месяца,
 * встают в очередь, тик — в расписание, первый тик — сразу. p_scheduled — из
 * расписания: без ключа, при идущем обновлении и когда всё свежее молча
 * пропускает, а не падает.
 */
CREATE FUNCTION public.market_demand_yandex_request(p_admin uuid DEFAULT NULL, p_scheduled boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  c_months CONSTANT text[] := ARRAY['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август',
                                    'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
  -- Прошлый месяц — последний полный у Вордстата (он считает по Москве)
  v_month date := (date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '1 month')::date;
  v_phrases text[];
  v_run bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('market_demand_yandex'));
  IF EXISTS (SELECT 1 FROM market_demand_yandex_runs WHERE status = 'pending') THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'обновление уже идёт');
    END IF;
    RAISE EXCEPTION 'Обновление Вордстата уже идёт';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'wordstat_api_key') THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'ключ Вордстата не задан');
    END IF;
    RAISE EXCEPTION 'Ключ Вордстата не задан';
  END IF;

  -- Числа фраз, которых ни одна тема больше не спрашивает
  DELETE FROM market_demand_yandex_monthly m
  WHERE NOT EXISTS (SELECT 1 FROM market_demand_topics t
                    WHERE market_demand_yandex_phrase(t.yandex_phrase, t.keywords) = m.phrase);

  SELECT array_agg(s.phrase ORDER BY s.phrase) INTO v_phrases
  FROM (SELECT DISTINCT market_demand_yandex_phrase(t.yandex_phrase, t.keywords) AS phrase
        FROM market_demand_topics t WHERE t.is_active) s
  WHERE s.phrase IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM market_demand_yandex_monthly m WHERE m.phrase = s.phrase AND m.month = v_month);
  IF v_phrases IS NULL THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'всё свежее');
    END IF;
    RAISE EXCEPTION 'Числа Вордстата уже свежие: % % есть по всем темам',
      c_months[extract(month FROM v_month)::integer], extract(year FROM v_month);
  END IF;
  IF cardinality(v_phrases) > 900 THEN
    RAISE EXCEPTION 'Фраз % — за 12 часов Вордстат отдаст не больше 900 (квота 100 в час); отключите часть тем',
      cardinality(v_phrases);
  END IF;

  INSERT INTO market_demand_yandex_runs (scheduled, api_base, phrases, requested_by)
  VALUES (p_scheduled, market_demand_yandex_api_base(), cardinality(v_phrases), p_admin)
  RETURNING id INTO v_run;
  INSERT INTO market_demand_yandex_jobs (run_id, phrase) SELECT v_run, unnest(v_phrases);

  PERFORM cron.schedule('Market Demand Yandex Tick', '30 seconds',
    $cron$SELECT public.market_demand_yandex_tick()$cron$);
  PERFORM market_demand_yandex_tick();
  RETURN jsonb_build_object('run', v_run, 'phrases', cardinality(v_phrases));
END $$;

/*
 * Для страницы: какой месяц ждём, сколько активных тем без него, когда было
 * последнее удачное обновление и последний запуск со счётом задач и отказами.
 */
CREATE FUNCTION public.market_demand_yandex_progress()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  WITH expected AS (
    SELECT (date_trunc('month', now() AT TIME ZONE 'Europe/Moscow') - interval '1 month')::date AS month
  ), phrases AS (
    SELECT DISTINCT market_demand_yandex_phrase(t.yandex_phrase, t.keywords) AS phrase
    FROM market_demand_topics t WHERE t.is_active
  )
  SELECT jsonb_build_object(
    'month', (SELECT month FROM expected),
    'phrases', (SELECT count(*) FROM phrases WHERE phrase IS NOT NULL),
    'stale', (SELECT count(*) FROM phrases p
              WHERE p.phrase IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM market_demand_yandex_monthly m
                                WHERE m.phrase = p.phrase AND m.month = (SELECT month FROM expected))),
    'last_done_at', (SELECT max(finished_at) FROM market_demand_yandex_runs WHERE status = 'done'),
    'run', (SELECT jsonb_build_object(
              'id', r.id, 'status', r.status, 'scheduled', r.scheduled, 'phrases', r.phrases,
              'done', (SELECT count(*) FROM market_demand_yandex_jobs j WHERE j.run_id = r.id AND j.status = 'done'),
              'failed', (SELECT count(*) FROM market_demand_yandex_jobs j WHERE j.run_id = r.id AND j.status = 'failed'),
              'paused_until', r.paused_until, 'error', r.error,
              'requested_at', r.requested_at, 'finished_at', r.finished_at,
              'failures', coalesce((
                SELECT jsonb_agg(jsonb_build_object('phrase', f.phrase, 'error', f.error) ORDER BY f.phrase)
                FROM (SELECT j.phrase, j.error FROM market_demand_yandex_jobs j
                      WHERE j.run_id = r.id AND j.status = 'failed' ORDER BY j.phrase LIMIT 20) f), '[]'::jsonb))
            FROM market_demand_yandex_runs r ORDER BY r.id DESC LIMIT 1));
$$;

-- ── 5. Сводка: Google и Вордстат рядом ──────────────────────────────────────
/*
 * Прежняя сводка — тело с боя на 1.11.2026 без изменений — и рядом то же по
 * Вордстату: своя фраза темы (yandex_phrase) и та, по которой считается
 * (y_phrase), 24 месяца, последний, среднее за 3 месяца и те же 3 месяца год
 * назад, тренд, пик и «скоро сезон». Ряд Вордстата — только у темы, чья фраза
 * дошла до последнего месяца: иначе нули в конце притворились бы падением.
 *
 * Новые столбцы — в конце: старая страница их просто не читает. Набор
 * столбцов сменился, поэтому DROP и CREATE (CREATE OR REPLACE его не меняет).
 */
DROP FUNCTION public.market_demand_summary();
CREATE FUNCTION public.market_demand_summary()
RETURNS TABLE (topic_id uuid, name text, kind text, keywords text[], match_terms text[], is_active boolean,
               series integer[], volume_last integer, volume_avg3 integer, volume_prev3 integer, trend_pct integer,
               peak_month integer, peak_ratio numeric, season_soon boolean, our_total integer, our_in_stock integer,
               data_until date, updated_at timestamptz,
               yandex_phrase text, y_phrase text, y_series integer[], y_volume_last integer, y_volume_avg3 integer,
               y_volume_prev3 integer, y_trend_pct integer, y_peak_month integer, y_peak_ratio numeric,
               y_season_soon boolean, y_data_until date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  WITH bounds AS (
    SELECT max(md.month) AS last FROM market_demand_monthly md
    WHERE md.keyword IN (SELECT unnest(t.keywords) FROM market_demand_topics t)
  ), months AS (
    SELECT m::date AS month, row_number() OVER (ORDER BY m)::integer AS idx
    FROM bounds, generate_series(bounds.last - interval '23 months', bounds.last, interval '1 month') m
    WHERE bounds.last IS NOT NULL
  ), kw_series AS (
    SELECT t.id AS topic_id, k.keyword,
           array_agg(coalesce(md.search_volume, 0) ORDER BY m.idx) AS s,
           bool_or(md.search_volume IS NOT NULL) AS has_data
    FROM market_demand_topics t
    CROSS JOIN LATERAL unnest(t.keywords) AS k(keyword)
    CROSS JOIN months m
    LEFT JOIN market_demand_monthly md ON md.keyword = k.keyword AND md.month = m.month
    GROUP BY t.id, k.keyword
  ), topic_series AS (
    SELECT x.topic_id, array_agg(x.total ORDER BY x.idx) AS series
    FROM (
      SELECT ds.topic_id, u.idx::integer AS idx, sum(u.v)::integer AS total
      FROM (SELECT DISTINCT kw.topic_id, kw.s FROM kw_series kw WHERE kw.has_data) ds
      CROSS JOIN LATERAL unnest(ds.s) WITH ORDINALITY AS u(v, idx)
      GROUP BY ds.topic_id, u.idx
    ) x
    GROUP BY x.topic_id
  ), season AS (
    SELECT ts.topic_id,
           CASE WHEN max(s.avg_v) > 0 THEN (array_agg(s.moy ORDER BY s.avg_v DESC, s.moy))[1] END AS peak_month,
           max(s.avg_v) / nullif(avg(s.avg_v), 0) AS peak_ratio
    FROM topic_series ts
    CROSS JOIN LATERAL (
      SELECT extract(month FROM m.month)::integer AS moy, avg(ts.series[m.idx]) AS avg_v
      FROM months m GROUP BY 1
    ) s
    GROUP BY ts.topic_id
  ), ours AS (
    SELECT t.id AS topic_id,
           count(p.id)::integer AS total,
           count(p.id) FILTER (WHERE p.stock_quantity > 0)::integer AS in_stock
    FROM market_demand_topics t
    LEFT JOIN LATERAL (
      SELECT p.id, p.stock_quantity
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active
        AND EXISTS (
          SELECT 1
          FROM unnest(CASE WHEN cardinality(t.match_terms) > 0 THEN t.match_terms ELSE t.keywords END) AS term
          WHERE lower(concat_ws(' ', p.name, b.name, c.name)) ~ market_demand_term_regex(term)
        )
    ) p ON true
    GROUP BY t.id
  ), y_topics AS (
    SELECT t.id AS topic_id, market_demand_yandex_phrase(t.yandex_phrase, t.keywords) AS phrase
    FROM market_demand_topics t
  ), y_bounds AS (
    SELECT max(ym.month) AS last FROM market_demand_yandex_monthly ym
    WHERE ym.phrase IN (SELECT yt.phrase FROM y_topics yt)
  ), y_months AS (
    SELECT m::date AS month, row_number() OVER (ORDER BY m)::integer AS idx
    FROM y_bounds, generate_series(y_bounds.last - interval '23 months', y_bounds.last, interval '1 month') m
    WHERE y_bounds.last IS NOT NULL
  ), y_series AS (
    SELECT yt.topic_id, array_agg(coalesce(ym.count, 0)::integer ORDER BY m.idx) AS series
    FROM y_topics yt
    CROSS JOIN y_months m
    LEFT JOIN market_demand_yandex_monthly ym ON ym.phrase = yt.phrase AND ym.month = m.month
    GROUP BY yt.topic_id
    HAVING bool_or(ym.month = (SELECT last FROM y_bounds))
  ), y_season AS (
    SELECT ys.topic_id,
           CASE WHEN max(s.avg_v) > 0 THEN (array_agg(s.moy ORDER BY s.avg_v DESC, s.moy))[1] END AS peak_month,
           max(s.avg_v) / nullif(avg(s.avg_v), 0) AS peak_ratio
    FROM y_series ys
    CROSS JOIN LATERAL (
      SELECT extract(month FROM m.month)::integer AS moy, avg(ys.series[m.idx]) AS avg_v
      FROM y_months m GROUP BY 1
    ) s
    GROUP BY ys.topic_id
  )
  SELECT t.id, t.name, t.kind, t.keywords, t.match_terms, t.is_active,
         ts.series,
         ts.series[24],
         round((ts.series[22] + ts.series[23] + ts.series[24]) / 3.0)::integer,
         round((ts.series[10] + ts.series[11] + ts.series[12]) / 3.0)::integer,
         CASE WHEN (ts.series[10] + ts.series[11] + ts.series[12]) >= 30
              THEN round(((ts.series[22] + ts.series[23] + ts.series[24]) - (ts.series[10] + ts.series[11] + ts.series[12])) * 100.0
                         / (ts.series[10] + ts.series[11] + ts.series[12]))::integer END,
         se.peak_month,
         round(se.peak_ratio, 2),
         -- Пик в этом месяце или в ближайшие два — пора закупать
         coalesce(se.peak_ratio >= 1.3
                  AND (se.peak_month - extract(month FROM now() AT TIME ZONE 'Asia/Almaty')::integer + 12) % 12 <= 2, false),
         o.total, o.in_stock,
         (SELECT last FROM bounds),
         (SELECT max(mk.updated_at) FROM market_demand_keywords mk WHERE mk.keyword = ANY (t.keywords)),
         t.yandex_phrase,
         yt.phrase,
         ys.series,
         ys.series[24],
         round((ys.series[22] + ys.series[23] + ys.series[24]) / 3.0)::integer,
         round((ys.series[10] + ys.series[11] + ys.series[12]) / 3.0)::integer,
         CASE WHEN (ys.series[10] + ys.series[11] + ys.series[12]) >= 30
              THEN round(((ys.series[22] + ys.series[23] + ys.series[24]) - (ys.series[10] + ys.series[11] + ys.series[12])) * 100.0
                         / (ys.series[10] + ys.series[11] + ys.series[12]))::integer END,
         yse.peak_month,
         round(yse.peak_ratio, 2),
         coalesce(yse.peak_ratio >= 1.3
                  AND (yse.peak_month - extract(month FROM now() AT TIME ZONE 'Asia/Almaty')::integer + 12) % 12 <= 2, false),
         CASE WHEN ys.series IS NOT NULL THEN (SELECT last FROM y_bounds) END
  FROM market_demand_topics t
  LEFT JOIN topic_series ts ON ts.topic_id = t.id
  LEFT JOIN season se ON se.topic_id = t.id
  LEFT JOIN ours o ON o.topic_id = t.id
  LEFT JOIN y_topics yt ON yt.topic_id = t.id
  LEFT JOIN y_series ys ON ys.topic_id = t.id
  LEFT JOIN y_season yse ON yse.topic_id = t.id
$$;

-- ── 6. Права ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.market_demand_topics_yandex()',
    'public.market_demand_yandex_phrase(text, text[])',
    'public.market_demand_yandex_key_set(text, text, text, text, uuid)',
    'public.market_demand_yandex_key_delete()',
    'public.market_demand_yandex_key_status()',
    'public.market_demand_yandex_api_base()',
    'public.market_demand_yandex_ingest(bigint, text, integer, text, jsonb, text)',
    'public.market_demand_yandex_finish(bigint)',
    'public.market_demand_yandex_tick()',
    'public.market_demand_yandex_request(uuid, boolean)',
    'public.market_demand_yandex_progress()',
    'public.market_demand_summary()'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ── 7. Расписание ───────────────────────────────────────────────────────────
-- Вордстат отдаёт прошлый месяц с первых дней нового; 5-го — вместе с Google.
-- Тик («Market Demand Yandex Tick») сюда не заводится: его ставит запуск.
SELECT cron.schedule(
  'Market Demand Yandex Monthly',
  '40 4 5 * *',
  $cron$SELECT public.market_demand_yandex_request(NULL, true)$cron$
);

-- ── 8. Проверка результата ──────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'market\_demand\_%';
  IF v_count <> 27 THEN
    RAISE EXCEPTION 'функций market_demand_* % вместо 27 — перегрузка или пропуск', v_count;
  END IF;
  IF pg_get_function_result('public.market_demand_summary()'::regprocedure) NOT LIKE '%y_data_until date)' THEN
    RAISE EXCEPTION 'сводка спроса без чисел Вордстата';
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'market\_demand\_%' AND c.relkind = 'r' AND c.relrowsecurity) <> 8 THEN
    RAISE EXCEPTION 'не у всех таблиц market_demand_* включён RLS';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'Market Demand Yandex Monthly') <> 1 THEN
    RAISE EXCEPTION 'плановое обновление Вордстата не заведено';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname LIKE 'market\_demand\_%'
               AND (has_function_privilege('anon', p.oid, 'EXECUTE')
                    OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))) THEN
    RAISE EXCEPTION 'функции спроса доступны гостю или покупателю';
  END IF;
END $$;
