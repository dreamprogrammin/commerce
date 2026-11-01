-- ============================================================================
-- Спрос на рынке — что ищут в Казахстане (DataForSEO, Google Ads).
--
-- Зачем (1 ноября 2026). Владелец: «нужно искать, что в рынке актуально,
-- чтобы мы отбирали товар от поставщиков в тг тот товар, который нужен».
-- Агент «новинки поставщиков» (docs/HANDOFF.md) будет ставить товару из поста
-- вердикт по спросу на его тему; до агента — страница «Спрос» в админке, по
-- ней владелец отбирает сам. Это шаг 3 «К закупке» («внешний спрос»).
--
-- Как устроено:
--   * market_demand_topics — темы: тип товара («толокар», «кукольный домик»)
--     или персонаж/бренд («лабубу», «барби»). У темы — поисковые фразы
--     (keywords) и признаки своего товара (match_terms — начало слова в
--     названии, бренде или разделе: «стич» найдёт «Стич», но не «пластичный»;
--     `*` — что угодно между частями: «кукольн*дом»);
--   * раз в месяц (5-го, 04:30 UTC) и по кнопке в админке — два запроса в
--     DataForSEO (Google Ads, Казахстан, русский): объёмы поиска фраз всех
--     тем за 24 месяца (одна задача до 1000 фраз) и «похожие запросы» от
--     затравок. Из похожих новые, ещё не покрытые темами, ложатся в
--     market_demand_candidates — «новые запросы на рынке»: так видно то, о
--     чём мы ещё не подумали (как когда-то «лабубу»);
--   * запрос уходит через pg_net (асинхронно), ответ разбирает
--     market_demand_collect() — по расписанию и со страницы админки;
--   * ключ DataForSEO (логин и пароль API) — в Vault, как ключи ИИ: задаётся в
--     админке, браузеру не возвращается;
--   * market_demand_summary() — сводка по темам: спрос, тренд к тем же
--     месяцам год назад, пик сезона, сколько своих товаров. Её читают
--     страница и (будущий) агент поставщиков;
--   * всё закрыто RLS без политик, функции — только service_role (серверные
--     маршруты /api/admin/demand* после requireAdmin и расписание);
--   * у каждого UPDATE/DELETE в функциях — WHERE: сессии PostgREST грузят
--     safeupdate, и без WHERE сбор со страницы падал бы (в psql — нет).
--
-- Цена (DataForSEO, ноябрь 2026): $0,09 за задачу Live — обновление ≈ $0,18.
-- Защита баланса: одно обновление за раз, не больше 5 ручных в сутки;
-- плановое пропускается, если за 20 дней уже было удачное.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.market_demand_topics') IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_proc WHERE proname LIKE 'market_demand%') THEN
    RAISE EXCEPTION 'спрос рынка уже заведён — миграция применялась?';
  END IF;
  IF (SELECT count(*) FROM pg_extension WHERE extname IN ('pg_net', 'pg_cron', 'supabase_vault')) <> 3 THEN
    RAISE EXCEPTION 'нужны расширения pg_net, pg_cron и supabase_vault';
  END IF;
  IF to_regprocedure('net.http_post(text, jsonb, jsonb, jsonb, integer)') IS NULL THEN
    RAISE EXCEPTION 'нет net.http_post(url, body, params, headers, timeout) — другая версия pg_net';
  END IF;
  IF to_regclass('net._http_response') IS NULL THEN
    RAISE EXCEPTION 'нет net._http_response';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'products'
        AND column_name IN ('name', 'brand_id', 'category_id', 'is_active', 'stock_quantity')) <> 5 THEN
    RAISE EXCEPTION 'у products нет name / brand_id / category_id / is_active / stock_quantity';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname IN ('Market Demand Monthly', 'Market Demand Collect')) THEN
    RAISE EXCEPTION 'задания расписания спроса уже есть';
  END IF;
END $$;

-- ── 1. Таблицы ──────────────────────────────────────────────────────────────
CREATE TABLE public.market_demand_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- type — тип товара; franchise — персонаж или бренд (ищут по имени)
  kind text NOT NULL DEFAULT 'type' CHECK (kind IN ('type', 'franchise')),
  keywords text[] NOT NULL,
  -- Суть каждой фразы без общих слов (market_demand_core) — ставит триггер;
  -- по ней похожие запросы сверяются с темами
  keyword_cores text[] NOT NULL DEFAULT '{}',
  match_terms text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX market_demand_topics_name_key ON public.market_demand_topics (lower(name));

-- Фразы, которые хоть раз спрашивали у Google Ads, и их последние цифры
CREATE TABLE public.market_demand_keywords (
  keyword text PRIMARY KEY,
  -- Последний месяц; NULL — Google фразу не знает (слишком редкая)
  search_volume integer,
  competition_index smallint,
  cpc numeric(10, 2),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_demand_monthly (
  keyword text NOT NULL REFERENCES public.market_demand_keywords(keyword) ON DELETE CASCADE,
  month date NOT NULL CHECK (month = date_trunc('month', month)::date),
  search_volume integer NOT NULL CHECK (search_volume >= 0),
  PRIMARY KEY (keyword, month)
);

-- Новые запросы на рынке: похожие на затравки, ещё не покрытые темами
CREATE TABLE public.market_demand_candidates (
  keyword text PRIMARY KEY,
  search_volume integer NOT NULL,
  -- Последние 3 месяца к 9 перед ними, %: растущее видно сразу
  trend_pct integer,
  -- new — показать; dismissed — «Скрыть» (больше не показывать); added — стала темой
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'dismissed', 'added')),
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.market_demand_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- volumes — объёмы фраз тем; ideas — похожие запросы
  kind text NOT NULL CHECK (kind IN ('volumes', 'ideas')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'failed')),
  scheduled boolean NOT NULL DEFAULT false,
  -- Номер запроса pg_net: по нему ответ ищется в net._http_response
  request_id bigint,
  keywords_sent integer NOT NULL DEFAULT 0,
  items integer,
  cost numeric(10, 4),
  error text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX market_demand_runs_pending ON public.market_demand_runs (requested_at) WHERE status = 'pending';

ALTER TABLE public.market_demand_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_demand_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_demand_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_demand_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_demand_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_demand_topics, public.market_demand_keywords, public.market_demand_monthly,
  public.market_demand_candidates, public.market_demand_runs FROM anon, authenticated;
GRANT ALL ON public.market_demand_topics, public.market_demand_keywords, public.market_demand_monthly,
  public.market_demand_candidates, public.market_demand_runs TO service_role;

-- ── 2. Фразы: нормализация и проверка ───────────────────────────────────────
/*
 * Фраза для Google Ads: строчными, одиночные пробелы, до 80 знаков и 10
 * слов, только буквы (русские, казахские, латинские), цифры и « .'&+-»
 * (DataForSEO отвергает эмодзи и прочие символы). У признаков своего товара
 * ещё «*» (любые буквы) и «/» («р/у»).
 */
CREATE FUNCTION public.market_demand_normalize(p_list text[], p_what text, p_terms boolean)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_out text[] := '{}';
  v_item text;
  v_clean text;
  v_allowed text := CASE WHEN p_terms
                      THEN '^[a-z0-9а-яёәғқңөұүһі*][a-z0-9а-яёәғқңөұүһі .''&+/*-]*$'
                      ELSE '^[a-z0-9а-яёәғқңөұүһі][a-z0-9а-яёәғқңөұүһі .''&+-]*$' END;
BEGIN
  FOREACH v_item IN ARRAY coalesce(p_list, '{}') LOOP
    v_clean := lower(btrim(regexp_replace(v_item, '\s+', ' ', 'g')));
    CONTINUE WHEN v_clean IS NULL OR v_clean = '' OR v_clean = ANY (v_out);
    IF length(v_clean) > 80 OR cardinality(string_to_array(v_clean, ' ')) > 10 THEN
      RAISE EXCEPTION '% «%» длиннее 80 знаков или 10 слов', p_what, v_clean;
    END IF;
    IF v_clean !~ v_allowed THEN
      RAISE EXCEPTION '% «%»: только буквы, цифры, пробел и « .''&+-»%', p_what, v_clean,
        CASE WHEN p_terms THEN ', «*» и «/»' ELSE '' END;
    END IF;
    v_out := v_out || v_clean;
  END LOOP;
  RETURN v_out;
END $$;

CREATE FUNCTION public.market_demand_topics_normalize()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.name := btrim(regexp_replace(NEW.name, '\s+', ' ', 'g'));
  IF NEW.name IS NULL OR NEW.name = '' OR length(NEW.name) > 80 THEN
    RAISE EXCEPTION 'Название темы — от 1 до 80 знаков';
  END IF;
  NEW.keywords := public.market_demand_normalize(NEW.keywords, 'Фраза', false);
  IF cardinality(NEW.keywords) NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'У темы — от 1 до 10 поисковых фраз';
  END IF;
  NEW.keyword_cores := ARRAY(SELECT public.market_demand_core(k) FROM unnest(NEW.keywords) AS k);
  NEW.match_terms := public.market_demand_normalize(NEW.match_terms, 'Признак товара', true);
  IF cardinality(NEW.match_terms) > 10 THEN
    RAISE EXCEPTION 'Признаков своего товара — не больше 10';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER market_demand_topics_normalize
  BEFORE INSERT OR UPDATE ON public.market_demand_topics
  FOR EACH ROW EXECUTE FUNCTION public.market_demand_topics_normalize();

/*
 * Суть запроса без общих слов: «игрушки для девочек 8 9 лет» → «»,
 * «лабубу купить в алматы» → «лабубу», «мягкая игрушка капибара» →
 * «капибара». Пустая суть — общий запрос, не тема.
 */
CREATE FUNCTION public.market_demand_core(p_keyword text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(p_keyword, '')),
    '\y(игрушк[а-яё]*|игр[аыуеой]?|детск[а-яё]*|дет(и|ей|ям|ьми)|для|девоч[а-яё]*|мальчик[а-яё]*|'
    'реб[её]н[а-яё]*|малыш[а-яё]*|подрост[а-яё]*|купить|куплю|цен[аыу]|стоимость|недорог[а-яё]*|'
    'дешев[а-яё]*|алматы|астан[аеыу]|шымкент[а-яё]*|караганд[а-яё]*|казахстан[а-яё]*|кз|kz|'
    'магазин[а-яё]*|интернет|доставк[а-яё]*|подар[а-яё]*|лет|год[а-яё]*|месяц[а-яё]*|'
    'лучш[а-яё]*|популярн[а-яё]*|нов[а-яё]*|модн[а-яё]*|тренд[а-яё]*|мягк[а-яё]*|'
    'больш[а-яё]*|маленьк[а-яё]*|оригинал[а-яё]*|набор[а-яё]*|'
    'в|во|на|с|со|и|от|до|по|из|к|[0-9]+)\y', ' ', 'g'), '\s+', ' ', 'g'))
$$;

/*
 * Мусор среди похожих запросов: про мультики, онлайн-игры, раскраски,
 * чужие магазины и б/у. Не тема для закупки. Общие запросы (пустая суть)
 * отсеиваются отдельно — по market_demand_core.
 */
CREATE FUNCTION public.market_demand_is_noise(p_keyword text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lower(coalesce(p_keyword, '')) ~ (
    '(онлайн|online|скачать|смотреть|мульт|раскраск|рисун|рисова|своими руками|как сделать|'
    'как называ|что такое|бесплатн|играть|приложени|\yapk\y|видео|картинк|\yфото|обои|песн|'
    '\yбу\y|б/у|olx|авито|avito|kaspi|каспи|wildberries|вайлдберриз|\ywb\y|ozon|озон|'
    'детский мир|аренда|прокат|ремонт|инструкц|отзыв|шаблон|распечат|\yмем|персонаж|серия|сезон)')
$$;

/*
 * Покрыт ли запрос (его суть) темами: суть совпала с сутью фразы темы, или в
 * нём имя персонажа/бренда («конструктор майнкрафт» — тема «Майнкрафт»).
 * Тип товара внутри запроса не покрывает: «кукла братц» — новое, хоть и кукла.
 */
CREATE FUNCTION public.market_demand_covered(p_core text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(p_core, '') <> '' AND EXISTS (
    SELECT 1
    FROM public.market_demand_topics t CROSS JOIN LATERAL unnest(t.keyword_cores) AS c(core)
    WHERE c.core <> ''
      AND (c.core = p_core
           OR (t.kind = 'franchise' AND ' ' || p_core || ' ' LIKE '% ' || c.core || ' %')))
$$;

-- Признак своего товара → регулярное выражение с начала слова:
-- «стич» → «\yстич» (не найдёт «пластичный»), «кукольн*дом» → «\yкукольн.*дом»
CREATE FUNCTION public.market_demand_term_regex(p_term text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT '\y' || replace(replace(replace(p_term, '.', '\.'), '+', '\+'), '*', '.*')
$$;

-- ── 3. Ключ DataForSEO — в Vault ────────────────────────────────────────────
/*
 * Логин и пароль API (не логин кабинета: строка со страницы API Access).
 * Проверяет их у DataForSEO сервер админки (бесплатный /appendix/user_data)
 * до сохранения; браузеру — только логин и последние 4 знака пароля.
 */
CREATE FUNCTION public.market_demand_credentials_set(p_login text, p_password text, p_admin uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_login text := btrim(p_login);
  v_password text := btrim(p_password);
  v_desc text := format('Логин и пароль API DataForSEO, заданы администратором %s', p_admin);
  v_id uuid;
BEGIN
  IF v_login IS NULL OR v_login = '' OR length(v_login) > 200 OR v_login ~ '[\s:]' THEN
    RAISE EXCEPTION 'Логин API DataForSEO пустой, длинный или с пробелом либо двоеточием';
  END IF;
  IF v_password IS NULL OR length(v_password) < 8 OR length(v_password) > 200 OR v_password ~ '\s' THEN
    RAISE EXCEPTION 'Пароль API DataForSEO не похож на пароль API';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'dataforseo_credentials';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(jsonb_build_object('login', v_login, 'password', v_password)::text,
      'dataforseo_credentials', v_desc);
  ELSE
    PERFORM vault.update_secret(v_id, jsonb_build_object('login', v_login, 'password', v_password)::text,
      'dataforseo_credentials', v_desc);
  END IF;
END $$;

CREATE FUNCTION public.market_demand_credentials_delete()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  DELETE FROM vault.secrets WHERE name = 'dataforseo_credentials';
$$;

-- Для сервера админки: проверить баланс у DataForSEO
CREATE FUNCTION public.market_demand_credentials_get()
RETURNS TABLE (login text, password text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret::jsonb ->> 'login', decrypted_secret::jsonb ->> 'password'
  FROM vault.decrypted_secrets WHERE name = 'dataforseo_credentials';
$$;

CREATE FUNCTION public.market_demand_credentials_status()
RETURNS TABLE (login text, password_last4 text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret::jsonb ->> 'login', right(decrypted_secret::jsonb ->> 'password', 4), updated_at
  FROM vault.decrypted_secrets WHERE name = 'dataforseo_credentials';
$$;

-- ── 4. Запрос в DataForSEO ──────────────────────────────────────────────────
/*
 * Адрес API. Для проверки — локальная заглушка через app.market_demand_api
 * (только localhost / host.docker.internal: иначе настройка увела бы ключ на
 * чужой сервер).
 */
CREATE FUNCTION public.market_demand_api_base()
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_url text := nullif(current_setting('app.market_demand_api', true), '');
BEGIN
  IF v_url IS NULL THEN
    RETURN 'https://api.dataforseo.com';
  END IF;
  IF v_url !~ '^http://(localhost|127\.0\.0\.1|host\.docker\.internal)(:[0-9]{2,5})?$' THEN
    RAISE EXCEPTION 'app.market_demand_api — только локальная заглушка';
  END IF;
  RETURN v_url;
END $$;

/*
 * Обновление: объёмы фраз всех активных тем за 24 месяца и похожие запросы
 * от затравок. Ответы разбирает market_demand_collect().
 * p_scheduled — из расписания: без ключа или при свежем обновлении молча
 * пропускает, а не падает.
 */
CREATE FUNCTION public.market_demand_request(p_admin uuid DEFAULT NULL, p_scheduled boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  -- Затравки похожих запросов (до 20 у DataForSEO)
  c_seeds CONSTANT text[] := ARRAY[
    'игрушки', 'детские игрушки', 'игрушки для детей', 'купить игрушку', 'игрушки для девочек',
    'игрушки для мальчиков', 'подарок ребенку', 'конструктор', 'кукла', 'машинка', 'мягкая игрушка',
    'развивающие игрушки', 'настольные игры', 'игрушки алматы', 'магазин игрушек', 'популярные игрушки'];
  v_creds jsonb;
  v_auth text;
  v_base text;
  v_keywords text[];
  v_headers jsonb;
  v_volumes bigint;
  v_ideas bigint;
BEGIN
  -- Одно обновление за раз: два нажатия подряд — одна оплата
  PERFORM pg_advisory_xact_lock(hashtext('market_demand_request'));
  IF EXISTS (SELECT 1 FROM market_demand_runs WHERE status = 'pending' AND requested_at > now() - interval '15 minutes') THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'обновление уже идёт');
    END IF;
    RAISE EXCEPTION 'Обновление уже идёт — дождитесь ответа DataForSEO';
  END IF;
  IF p_scheduled AND EXISTS (SELECT 1 FROM market_demand_runs
                             WHERE kind = 'volumes' AND status = 'done' AND requested_at > now() - interval '20 days') THEN
    RETURN jsonb_build_object('skipped', 'обновлялось меньше 20 дней назад');
  END IF;
  IF NOT p_scheduled AND (SELECT count(*) FROM market_demand_runs
                          WHERE kind = 'volumes' AND NOT scheduled AND requested_at > now() - interval '24 hours') >= 5 THEN
    RAISE EXCEPTION 'Не больше 5 обновлений в сутки — каждое оплачивается с баланса DataForSEO';
  END IF;

  SELECT decrypted_secret::jsonb INTO v_creds FROM vault.decrypted_secrets WHERE name = 'dataforseo_credentials';
  IF v_creds IS NULL THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'ключ DataForSEO не задан');
    END IF;
    RAISE EXCEPTION 'Ключ DataForSEO не задан';
  END IF;

  SELECT array_agg(k ORDER BY k) INTO v_keywords
  FROM (SELECT DISTINCT unnest(keywords) AS k FROM market_demand_topics WHERE is_active) s;
  IF v_keywords IS NULL THEN
    IF p_scheduled THEN
      RETURN jsonb_build_object('skipped', 'нет активных тем');
    END IF;
    RAISE EXCEPTION 'Нет активных тем — нечего спрашивать';
  END IF;
  IF cardinality(v_keywords) > 1000 THEN
    RAISE EXCEPTION 'Фраз % — DataForSEO берёт до 1000 за задачу; отключите часть тем', cardinality(v_keywords);
  END IF;

  v_base := market_demand_api_base();
  v_auth := 'Basic ' || replace(encode(convert_to((v_creds ->> 'login') || ':' || (v_creds ->> 'password'), 'UTF8'), 'base64'), E'\n', '');
  v_headers := jsonb_build_object('Authorization', v_auth, 'Content-Type', 'application/json');

  INSERT INTO market_demand_runs (kind, scheduled, keywords_sent, requested_by, request_id)
  VALUES ('volumes', p_scheduled, cardinality(v_keywords), p_admin, net.http_post(
    url := v_base || '/v3/keywords_data/google_ads/search_volume/live',
    body := jsonb_build_array(jsonb_build_object(
      'keywords', to_jsonb(v_keywords),
      'location_code', 2398,          -- Казахстан
      'language_code', 'ru',
      'date_from', to_char(date_trunc('month', now()) - interval '24 months', 'YYYY-MM-DD'),
      'search_partners', false)),
    headers := v_headers,
    timeout_milliseconds := 120000))
  RETURNING id INTO v_volumes;

  INSERT INTO market_demand_runs (kind, scheduled, keywords_sent, requested_by, request_id)
  VALUES ('ideas', p_scheduled, cardinality(c_seeds), p_admin, net.http_post(
    url := v_base || '/v3/keywords_data/google_ads/keywords_for_keywords/live',
    body := jsonb_build_array(jsonb_build_object(
      'keywords', to_jsonb(c_seeds),
      'location_code', 2398,
      'language_code', 'ru',
      'sort_by', 'search_volume',
      'include_adult_keywords', false,
      'search_partners', false)),
    headers := v_headers,
    timeout_milliseconds := 120000))
  RETURNING id INTO v_ideas;

  RETURN jsonb_build_object('volumes_run', v_volumes, 'ideas_run', v_ideas, 'keywords', cardinality(v_keywords));
END $$;

-- ── 5. Разбор ответа ────────────────────────────────────────────────────────
/*
 * Ответ DataForSEO по запуску. p_error — сбой сети или таймаут (тогда тела
 * нет). Возвращает итоговый статус запуска. Отдельно от collect — чтобы
 * проверять разбор на готовых ответах, без сети.
 */
CREATE FUNCTION public.market_demand_ingest(p_run_id bigint, p_http_status integer, p_content text, p_error text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_run market_demand_runs;
  v_body jsonb;
  v_task jsonb;
  v_result jsonb;
  v_code integer;
  v_items integer := 0;
BEGIN
  SELECT * INTO v_run FROM market_demand_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Нет запуска %', p_run_id;
  END IF;
  IF v_run.status <> 'pending' THEN
    RETURN v_run.status;
  END IF;

  IF p_error IS NOT NULL THEN
    UPDATE market_demand_runs SET status = 'failed', error = p_error, finished_at = now() WHERE id = p_run_id;
    RETURN 'failed';
  END IF;
  BEGIN
    v_body := p_content::jsonb;
  EXCEPTION WHEN others THEN
    UPDATE market_demand_runs
    SET status = 'failed', error = format('DataForSEO ответил не JSON (HTTP %s)', p_http_status), finished_at = now()
    WHERE id = p_run_id;
    RETURN 'failed';
  END;

  v_task := v_body -> 'tasks' -> 0;
  v_code := CASE WHEN (v_body ->> 'status_code') = '20000' THEN (v_task ->> 'status_code')::integer
                 ELSE (v_body ->> 'status_code')::integer END;
  IF v_code IS DISTINCT FROM 20000 THEN
    UPDATE market_demand_runs
    SET status = 'failed', cost = nullif(v_body ->> 'cost', '')::numeric, finished_at = now(),
        error = CASE
          WHEN v_code = 40100 OR p_http_status = 401 THEN 'DataForSEO не принял ключ — проверьте логин и пароль API'
          WHEN v_code BETWEEN 40200 AND 40299 OR p_http_status = 402 THEN 'На балансе DataForSEO не хватает денег'
          ELSE format('DataForSEO: %s (код %s)',
                      coalesce(v_task ->> 'status_message', v_body ->> 'status_message', 'без пояснения'),
                      coalesce(v_code::text, 'нет'))
        END
    WHERE id = p_run_id;
    RETURN 'failed';
  END IF;

  v_result := CASE WHEN jsonb_typeof(v_task -> 'result') = 'array' THEN v_task -> 'result' ELSE '[]'::jsonb END;

  -- Фраза, её последние цифры и помесячные объёмы
  IF to_regclass('pg_temp.market_demand_ingest_items') IS NULL THEN
    CREATE TEMP TABLE market_demand_ingest_items (
      keyword text PRIMARY KEY, search_volume integer, competition_index smallint, cpc numeric, monthly jsonb, core text
    ) ON COMMIT DROP;
  ELSE
    -- Второй разбор в той же транзакции (сбор нескольких ответов разом)
    TRUNCATE market_demand_ingest_items;
  END IF;
  INSERT INTO market_demand_ingest_items
  SELECT DISTINCT ON (kw) kw, sv, ci, cpc, ms, NULL
  FROM (
    SELECT lower(btrim(i ->> 'keyword')) AS kw,
           nullif(i ->> 'search_volume', '')::integer AS sv,
           nullif(i ->> 'competition_index', '')::smallint AS ci,
           nullif(i ->> 'cpc', '')::numeric AS cpc,
           CASE WHEN jsonb_typeof(i -> 'monthly_searches') = 'array' THEN i -> 'monthly_searches' ELSE '[]'::jsonb END AS ms
    FROM jsonb_array_elements(v_result) i
    WHERE jsonb_typeof(i) = 'object'
  ) s
  WHERE kw IS NOT NULL AND kw <> ''
  ORDER BY kw, sv DESC NULLS LAST;

  IF v_run.kind = 'ideas' THEN
    -- Только новое и живое: от 50 запросов в месяц, не мусор, не общий
    -- запрос, не покрыто темами
    DELETE FROM market_demand_ingest_items WHERE coalesce(search_volume, 0) < 50 OR market_demand_is_noise(keyword);
    -- WHERE обязателен: PostgREST грузит safeupdate, UPDATE без WHERE он
    -- отвергает — а collect со страницы идёт именно через PostgREST
    UPDATE market_demand_ingest_items SET core = market_demand_core(keyword) WHERE core IS NULL;
    DELETE FROM market_demand_ingest_items WHERE core = '' OR market_demand_covered(core);
  END IF;

  INSERT INTO market_demand_keywords AS mk (keyword, search_volume, competition_index, cpc, updated_at)
  SELECT keyword, search_volume, competition_index, round(cpc, 2), now() FROM market_demand_ingest_items
  ON CONFLICT (keyword) DO UPDATE
  SET search_volume = EXCLUDED.search_volume, competition_index = EXCLUDED.competition_index,
      cpc = EXCLUDED.cpc, updated_at = now();

  INSERT INTO market_demand_monthly (keyword, month, search_volume)
  SELECT DISTINCT ON (i.keyword, m.month) i.keyword, m.month, m.volume
  FROM market_demand_ingest_items i
  CROSS JOIN LATERAL (
    SELECT make_date((e ->> 'year')::integer, (e ->> 'month')::integer, 1) AS month,
           greatest(coalesce(nullif(e ->> 'search_volume', '')::integer, 0), 0) AS volume
    FROM jsonb_array_elements(i.monthly) e
    WHERE jsonb_typeof(e) = 'object' AND (e ->> 'year') ~ '^\d{4}$' AND (e ->> 'month') ~ '^\d{1,2}$'
  ) m
  ON CONFLICT (keyword, month) DO UPDATE SET search_volume = EXCLUDED.search_volume;

  IF v_run.kind = 'ideas' THEN
    INSERT INTO market_demand_candidates AS c (keyword, search_volume, trend_pct)
    SELECT i.keyword, i.search_volume, t.trend_pct
    FROM market_demand_ingest_items i
    LEFT JOIN LATERAL (
      -- Последние 3 месяца к 9 перед ними
      SELECT CASE WHEN avg(v) FILTER (WHERE rn > 3) >= 10
                  THEN round((avg(v) FILTER (WHERE rn <= 3) - avg(v) FILTER (WHERE rn > 3)) * 100
                             / avg(v) FILTER (WHERE rn > 3))::integer END AS trend_pct
      FROM (
        SELECT greatest(coalesce(nullif(e ->> 'search_volume', '')::integer, 0), 0) AS v,
               row_number() OVER (ORDER BY (e ->> 'year')::integer DESC, (e ->> 'month')::integer DESC) AS rn
        FROM jsonb_array_elements(i.monthly) e
        WHERE jsonb_typeof(e) = 'object'
      ) x
      WHERE rn <= 12
    ) t ON true
    ON CONFLICT (keyword) DO UPDATE
    SET search_volume = EXCLUDED.search_volume, trend_pct = EXCLUDED.trend_pct, last_seen = now();
  END IF;

  SELECT count(*) INTO v_items FROM market_demand_ingest_items;
  UPDATE market_demand_runs
  SET status = 'done', items = v_items, cost = nullif(v_body ->> 'cost', '')::numeric, finished_at = now()
  WHERE id = p_run_id;
  RETURN 'done';
END $$;

/*
 * Забрать пришедшие ответы. Зовут расписание (5-го числа, каждые 10 минут
 * с 04:00 до 06:59 UTC) и страница админки, пока обновление идёт.
 * Возвращает, сколько запусков завершено.
 *
 * Ответ виден не сразу: фоновый обработчик pg_net иногда берёт очередь через
 * несколько минут (локально 1.11.2026 бывало и 6 минут при обычных 1–2 с).
 * Поэтому «ответа нет» — только через час; сам ответ pg_net хранит 6 часов.
 */
CREATE FUNCTION public.market_demand_collect()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  r record;
  v_resp record;
  v_done integer := 0;
BEGIN
  FOR r IN SELECT id, request_id, requested_at FROM market_demand_runs
           WHERE status = 'pending' ORDER BY id FOR UPDATE SKIP LOCKED LOOP
    SELECT status_code, content, timed_out, error_msg INTO v_resp FROM net._http_response WHERE id = r.request_id;
    IF FOUND THEN
      PERFORM market_demand_ingest(r.id, v_resp.status_code, v_resp.content,
        CASE WHEN v_resp.timed_out THEN 'DataForSEO не ответил за 2 минуты'
             WHEN v_resp.error_msg IS NOT NULL THEN 'Сбой связи с DataForSEO: ' || v_resp.error_msg END);
      v_done := v_done + 1;
    ELSIF r.requested_at < now() - interval '60 minutes' THEN
      UPDATE market_demand_runs SET status = 'failed', error = 'Ответа от DataForSEO нет', finished_at = now()
      WHERE id = r.id;
      v_done := v_done + 1;
    END IF;
  END LOOP;
  RETURN v_done;
END $$;

-- ── 6. Сводка по темам ──────────────────────────────────────────────────────
/*
 * На тему — 24 месяца спроса (сумма её фраз; фразы с одинаковым рядом Google
 * склеил как близкие варианты — считаются один раз), последний месяц, среднее
 * за 3 месяца и те же 3 месяца год назад, тренд, месяц пика и сколько своих
 * товаров (активных и в наличии) по признакам темы.
 */
CREATE FUNCTION public.market_demand_summary()
RETURNS TABLE (
  topic_id uuid,
  name text,
  kind text,
  keywords text[],
  match_terms text[],
  is_active boolean,
  series integer[],
  volume_last integer,
  volume_avg3 integer,
  volume_prev3 integer,
  trend_pct integer,
  peak_month integer,
  peak_ratio numeric,
  season_soon boolean,
  our_total integer,
  our_in_stock integer,
  data_until date,
  updated_at timestamptz
)
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
         (SELECT max(mk.updated_at) FROM market_demand_keywords mk WHERE mk.keyword = ANY (t.keywords))
  FROM market_demand_topics t
  LEFT JOIN topic_series ts ON ts.topic_id = t.id
  LEFT JOIN season se ON se.topic_id = t.id
  LEFT JOIN ours o ON o.topic_id = t.id
$$;

/*
 * Новые запросы для страницы: ещё не скрытые и не покрытые темами (тему
 * могли завести уже после того, как запрос попал сюда), с рядом за 12
 * месяцев от старого к новому.
 */
CREATE FUNCTION public.market_demand_candidates_list(p_limit integer DEFAULT 40)
RETURNS TABLE (keyword text, search_volume integer, trend_pct integer, series integer[], first_seen timestamptz, last_seen timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
  SELECT c.keyword, c.search_volume, c.trend_pct,
         (SELECT array_agg(x.search_volume ORDER BY x.month)
          FROM (SELECT m.month, m.search_volume FROM market_demand_monthly m
                WHERE m.keyword = c.keyword ORDER BY m.month DESC LIMIT 12) x),
         c.first_seen, c.last_seen
  FROM market_demand_candidates c
  WHERE c.status = 'new' AND NOT market_demand_covered(market_demand_core(c.keyword))
  ORDER BY c.search_volume DESC, c.keyword
  LIMIT least(greatest(coalesce(p_limit, 40), 1), 200)
$$;

-- ── 7. Темы для начала ──────────────────────────────────────────────────────
/*
 * Стартовый список: разделы магазина, карта спроса 28.10 (docs/HANDOFF.md) и
 * ходовые на рынке типы и персонажи. Правится в админке; новое подскажут
 * «новые запросы на рынке».
 */
INSERT INTO public.market_demand_topics (name, kind, keywords, match_terms) VALUES
  ('Толокар', 'type', ARRAY['толокар', 'толокар для детей'], ARRAY['толокар']),
  ('Каталка', 'type', ARRAY['каталка для детей', 'каталка'], ARRAY['каталк']),
  ('Беговел', 'type', ARRAY['беговел'], ARRAY['беговел']),
  ('Детский самокат', 'type', ARRAY['детский самокат', 'самокат детский'], ARRAY['самокат']),
  ('Детский велосипед', 'type', ARRAY['детский велосипед', 'велосипед детский'], ARRAY['велосипед']),
  ('Детский электромобиль', 'type', ARRAY['детский электромобиль', 'электромобиль детский'], ARRAY['электромобил']),
  ('Качалка', 'type', ARRAY['качалка для детей', 'лошадка качалка'], ARRAY['качалк']),
  ('Конструктор', 'type', ARRAY['конструктор', 'конструктор для детей'], ARRAY['конструктор']),
  ('Магнитный конструктор', 'type', ARRAY['магнитный конструктор'], ARRAY['магнитн*конструктор', 'магнитные блоки']),
  ('Пазлы', 'type', ARRAY['пазлы', 'пазлы для детей'], ARRAY['пазл']),
  ('Мозаика', 'type', ARRAY['мозаика для детей'], ARRAY['мозаик']),
  ('Настольные игры', 'type', ARRAY['настольные игры', 'настольная игра'], ARRAY['настольн']),
  ('Кукла', 'type', ARRAY['кукла', 'куклы'], ARRAY['кукл']),
  ('Кукольный домик', 'type', ARRAY['кукольный домик', 'домик для кукол'], ARRAY['кукольн*дом', 'домик для кукол']),
  ('Пупс', 'type', ARRAY['пупс'], ARRAY['пупс']),
  ('Кукла реборн', 'type', ARRAY['кукла реборн', 'реборн'], ARRAY['реборн', 'reborn']),
  ('Мягкие игрушки', 'type', ARRAY['мягкие игрушки', 'мягкая игрушка'], ARRAY['мягк*игрушк', 'плюш']),
  ('Интерактивные игрушки', 'type', ARRAY['интерактивные игрушки', 'интерактивная игрушка'], ARRAY['интерактивн']),
  ('Развивающие игрушки', 'type', ARRAY['развивающие игрушки'], ARRAY['развива']),
  ('Бизиборд', 'type', ARRAY['бизиборд'], ARRAY['бизиборд', 'бизидом', 'бизидоск', 'бизикуб']),
  ('Сортер', 'type', ARRAY['сортер'], ARRAY['сортер']),
  ('Погремушки', 'type', ARRAY['погремушки', 'погремушка'], ARRAY['погремушк']),
  ('Игрушки для ванной', 'type', ARRAY['игрушки для ванной', 'игрушки для купания'], ARRAY['для ванн', 'для купания']),
  ('Развивающий коврик', 'type', ARRAY['развивающий коврик', 'коврик пазл'], ARRAY['коврик']),
  ('Машинки', 'type', ARRAY['машинки', 'машинка'], ARRAY['машинк']),
  ('Машинка на пульте', 'type', ARRAY['машинка на пульте', 'радиоуправляемая машина'], ARRAY['радиоуправля', 'на пульте', 'р/у']),
  ('Автотрек', 'type', ARRAY['автотрек', 'трек для машинок'], ARRAY['автотрек', 'трек']),
  ('Парковка для машинок', 'type', ARRAY['парковка для машинок', 'гараж для машинок'], ARRAY['паркинг', 'парковк', 'гараж']),
  ('Спецтехника', 'type', ARRAY['игрушечный экскаватор', 'спецтехника игрушки'], ARRAY['экскаватор', 'спецтехник', 'бетономешалк', 'самосвал']),
  ('Железная дорога', 'type', ARRAY['детская железная дорога', 'железная дорога игрушка'], ARRAY['железн*дорог']),
  ('Роботы', 'type', ARRAY['робот игрушка', 'робот трансформер'], ARRAY['робот']),
  ('Трансформеры', 'type', ARRAY['трансформеры', 'трансформер игрушка'], ARRAY['трансформер']),
  ('Динозавры', 'type', ARRAY['динозавр игрушка', 'динозавры игрушки'], ARRAY['динозавр']),
  ('Квадрокоптер', 'type', ARRAY['квадрокоптер', 'дрон для детей'], ARRAY['квадрокоптер', 'дрон']),
  ('Летающие игрушки', 'type', ARRAY['летающая игрушка', 'летающий шар'], ARRAY['летающ']),
  ('Бластер', 'type', ARRAY['бластер', 'нерф'], ARRAY['бластер', 'nerf', 'нерф']),
  ('Водяной пистолет', 'type', ARRAY['водяной пистолет'], ARRAY['водян*пистолет']),
  ('Игрушечное оружие', 'type', ARRAY['игрушечный пистолет', 'игрушечный автомат'], ARRAY['пистолет', 'автомат']),
  ('Кинетический песок', 'type', ARRAY['кинетический песок'], ARRAY['кинетическ*песок']),
  ('Слайм', 'type', ARRAY['слайм', 'лизун'], ARRAY['слайм', 'лизун', 'slime']),
  ('Сквиш', 'type', ARRAY['сквиш'], ARRAY['сквиш', 'squish']),
  ('Поп ит', 'type', ARRAY['поп ит', 'pop it'], ARRAY['поп ит', 'pop it']),
  ('Антистресс', 'type', ARRAY['антистресс игрушка', 'антистресс'], ARRAY['антистресс']),
  ('Пластилин и масса для лепки', 'type', ARRAY['пластилин', 'плей до'], ARRAY['пластилин', 'play-doh', 'плей до', 'для лепки']),
  ('Набор для творчества', 'type', ARRAY['набор для творчества', 'наборы для творчества'], ARRAY['для творчества']),
  ('3D-ручка', 'type', ARRAY['3д ручка', '3d ручка'], ARRAY['3d ручк', '3д ручк']),
  ('Детская косметика', 'type', ARRAY['детская косметика', 'косметика для девочек'], ARRAY['косметик', 'макияж']),
  ('Набор стилиста', 'type', ARRAY['набор парикмахера для девочек', 'набор стилиста'], ARRAY['стилист', 'парикмахер']),
  ('Детская кухня', 'type', ARRAY['детская кухня', 'игрушечная кухня'], ARRAY['кухн']),
  ('Набор доктора', 'type', ARRAY['набор доктора', 'игровой набор доктора'], ARRAY['доктор']),
  ('Игрушечная касса', 'type', ARRAY['детская касса', 'игрушечная касса'], ARRAY['касса']),
  ('Детская палатка', 'type', ARRAY['детская палатка', 'палатка для детей'], ARRAY['палатк']),
  ('Мыльные пузыри', 'type', ARRAY['мыльные пузыри', 'генератор мыльных пузырей'], ARRAY['мыльн*пузыр']),
  ('Бадминтон', 'type', ARRAY['бадминтон', 'ракетки для бадминтона'], ARRAY['бадминтон', 'ракетк']),
  ('Детский синтезатор', 'type', ARRAY['детский синтезатор', 'детское пианино'], ARRAY['синтезатор', 'пианино']),
  ('Детская домбра', 'type', ARRAY['детская домбра', 'домбра детская'], ARRAY['домбр']),
  ('Детская гитара', 'type', ARRAY['детская гитара', 'гитара для детей'], ARRAY['гитар']),
  ('Барабанная установка', 'type', ARRAY['детская барабанная установка', 'барабан детский'], ARRAY['барабан']),
  ('Микрофон караоке', 'type', ARRAY['детский микрофон', 'микрофон караоке'], ARRAY['микрофон']),
  ('Детский микроскоп', 'type', ARRAY['детский микроскоп', 'микроскоп для детей'], ARRAY['микроскоп']),
  ('Опыты и химия', 'type', ARRAY['набор юного химика', 'опыты для детей'], ARRAY['химик', 'опыт']),
  ('Карнавальный костюм', 'type', ARRAY['карнавальный костюм', 'детский новогодний костюм'], ARRAY['костюм', 'карнавальн']),
  ('Игрушки-сюрпризы', 'type', ARRAY['игрушка сюрприз', 'питомец сюрприз'], ARRAY['сюрприз']),
  ('Юла', 'type', ARRAY['юла', 'волчок'], ARRAY['юла', 'волчок']),
  ('LEGO', 'franchise', ARRAY['лего', 'lego'], ARRAY['lego', 'лего']),
  ('Куклы L.O.L.', 'franchise', ARRAY['кукла лол', 'лол сюрприз'], ARRAY['l.o.l', 'lol', 'лол']),
  ('Барби', 'franchise', ARRAY['барби', 'кукла барби'], ARRAY['барби', 'barbie']),
  ('Лабубу', 'franchise', ARRAY['лабубу', 'labubu'], ARRAY['лабубу', 'labubu']),
  ('Hot Wheels', 'franchise', ARRAY['хот вилс', 'hot wheels'], ARRAY['hot wheels', 'хот вилс']),
  ('Щенячий патруль', 'franchise', ARRAY['щенячий патруль', 'щенячий патруль игрушки'], ARRAY['щенячий патруль', 'paw patrol']),
  ('Человек-паук', 'franchise', ARRAY['человек паук игрушка', 'спайдермен игрушка'], ARRAY['человек-паук', 'человек паук', 'spider']),
  ('Майнкрафт', 'franchise', ARRAY['майнкрафт игрушки', 'лего майнкрафт'], ARRAY['майнкрафт', 'minecraft']),
  ('Роблокс', 'franchise', ARRAY['роблокс игрушки'], ARRAY['роблокс', 'roblox']),
  ('Стич', 'franchise', ARRAY['стич игрушка', 'мягкая игрушка стич'], ARRAY['стич', 'stitch']),
  ('Капибара', 'franchise', ARRAY['капибара игрушка', 'мягкая игрушка капибара'], ARRAY['капибар']),
  ('Куроми', 'franchise', ARRAY['куроми', 'kuromi'], ARRAY['куроми', 'kuromi']),
  ('Hello Kitty', 'franchise', ARRAY['хелло китти', 'hello kitty'], ARRAY['hello kitty', 'хелло китти']),
  ('Хаги Ваги', 'franchise', ARRAY['хаги ваги'], ARRAY['хаги ваги', 'huggy']),
  ('Скибиди туалет', 'franchise', ARRAY['скибиди туалет игрушки'], ARRAY['скибиди']),
  ('Фиксики', 'franchise', ARRAY['фиксики игрушки'], ARRAY['фиксик']),
  ('Синий трактор', 'franchise', ARRAY['синий трактор игрушка'], ARRAY['синий трактор']),
  ('Холодное сердце', 'franchise', ARRAY['кукла эльза', 'холодное сердце игрушки'], ARRAY['эльза', 'холодное сердце', 'frozen']),
  ('Молния Маквин', 'franchise', ARRAY['молния маквин игрушка'], ARRAY['маквин', 'mcqueen']),
  ('Бейблэйд', 'franchise', ARRAY['бейблэйд', 'beyblade'], ARRAY['бейблэйд', 'бейблейд', 'beyblade']),
  ('Свинка Пеппа', 'franchise', ARRAY['свинка пеппа игрушки'], ARRAY['пеппа', 'peppa']),
  ('My Little Pony', 'franchise', ARRAY['май литл пони игрушки'], ARRAY['little pony', 'литл пони']),
  ('Sylvanian Families', 'franchise', ARRAY['сильвания фэмили'], ARRAY['sylvanian', 'сильвани']),
  ('Monster High', 'franchise', ARRAY['монстер хай'], ARRAY['monster high', 'монстер хай']),
  ('Baby Born', 'franchise', ARRAY['беби бон', 'baby born'], ARRAY['baby born', 'беби бон', 'бэби борн']),
  ('Тамагочи', 'franchise', ARRAY['тамагочи'], ARRAY['тамагочи', 'tamagotchi']),
  ('Sluban', 'franchise', ARRAY['sluban', 'слубан'], ARRAY['sluban', 'слубан']),
  ('CaDA', 'franchise', ARRAY['cada конструктор'], ARRAY['cada']);

-- ── 8. Права ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.market_demand_normalize(text[], text, boolean)',
    'public.market_demand_topics_normalize()',
    'public.market_demand_core(text)',
    'public.market_demand_is_noise(text)',
    'public.market_demand_covered(text)',
    'public.market_demand_term_regex(text)',
    'public.market_demand_credentials_set(text, text, uuid)',
    'public.market_demand_credentials_delete()',
    'public.market_demand_credentials_get()',
    'public.market_demand_credentials_status()',
    'public.market_demand_api_base()',
    'public.market_demand_request(uuid, boolean)',
    'public.market_demand_ingest(bigint, integer, text, text)',
    'public.market_demand_collect()',
    'public.market_demand_summary()',
    'public.market_demand_candidates_list(integer)'
  ] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ── 9. Расписание ───────────────────────────────────────────────────────────
-- Google Ads отдаёт прошлый месяц в первые дни нового — 5-го уже есть.
SELECT cron.schedule(
  'Market Demand Monthly',
  '30 4 5 * *',
  $cron$SELECT public.market_demand_request(NULL, true)$cron$
);
SELECT cron.schedule(
  'Market Demand Collect',
  '*/10 4-6 5 * *',
  $cron$SELECT public.market_demand_collect()$cron$
);

-- ── 10. Проверка результата ─────────────────────────────────────────────────
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname LIKE 'market\_demand\_%';
  IF v_count <> 16 THEN
    RAISE EXCEPTION 'функций market_demand_* % вместо 16 — перегрузка или пропуск', v_count;
  END IF;
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname LIKE 'market\_demand\_%' AND c.relkind = 'r' AND c.relrowsecurity) <> 5 THEN
    RAISE EXCEPTION 'не у всех таблиц market_demand_* включён RLS';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname IN ('Market Demand Monthly', 'Market Demand Collect')) <> 2 THEN
    RAISE EXCEPTION 'задания расписания спроса не заведены';
  END IF;
  SELECT count(*) INTO v_count FROM public.market_demand_topics;
  IF v_count < 90 THEN
    RAISE EXCEPTION 'тем % — стартовый список не лёг', v_count;
  END IF;
  IF has_function_privilege('anon', 'public.market_demand_summary()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.market_demand_request(uuid, boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'функции спроса доступны гостю или покупателю';
  END IF;
END $$;
