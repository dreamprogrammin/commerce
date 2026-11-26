-- Сторож доступности сайта и платные сервисы (21 ноября 2026).
--
-- 21.11 Vercel поставил проект на паузу (Hobby сверх лимитов): uhti.kz отдавал
-- 402 на всё, владелец узнал из ошибки в админке. Владелец: «давай оба делай и
-- плюс в админку нужно завести батарейку состояния сайта и все сервисы платные
-- которые имеются».
--
--  - site_health_checks — проверки: каждые 5 минут эдж-функция site-watchdog
--    открывает главную и каталог; хранится 30 дней;
--  - site_health_incidents — сбои: начало, конец, причина и отметки, что
--    владельцу написали в Telegram (пишется после второй неудачной проверки
--    подряд, чтобы не будить одной случайной);
--  - paid_services — платные сервисы с планом, ценой и датой продления; их
--    правит владелец в админке, за 7 дней до продления пишет бот;
--  - site_watch_tick() — расписание «Site Watchdog» зовёт функцию. Адрес
--    функций и сайта — из app_settings (functions_url, site_watch_url): на бою
--    строк нет и берутся боевые, на локальной базе стоят свои, и локальный
--    стенд в бой не стучится;
--  - site_health_storage() — размер базы и файлов для «батарейки» Supabase.
-- Таблицы закрыты, как остальные служебные: читает и пишет только сервер.

-- ── 0. Проверка состояния ────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.site_health_checks') IS NOT NULL
     OR to_regclass('public.site_health_incidents') IS NOT NULL
     OR to_regclass('public.paid_services') IS NOT NULL
     OR to_regprocedure('public.site_watch_tick()') IS NOT NULL THEN
    RAISE EXCEPTION 'сторож сайта уже есть';
  END IF;
  IF to_regclass('public.app_settings') IS NULL OR to_regprocedure('public.internal_function_headers()') IS NULL THEN
    RAISE EXCEPTION 'нет app_settings или internal_function_headers() — нужны миграции 20260907100000 и 20261019120000';
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'Site Watchdog') THEN
    RAISE EXCEPTION 'задача «Site Watchdog» уже есть';
  END IF;
END $$;

-- ── 1. Проверки и сбои ───────────────────────────────────────────────────────
CREATE TABLE public.site_health_checks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  url text NOT NULL CHECK (url ~ '^https?://' AND length(url) <= 300),
  ok boolean NOT NULL,
  -- HTTP-код; null — ответа не было (таймаут, сеть)
  status integer CHECK (status BETWEEN 100 AND 599),
  ms integer CHECK (ms >= 0),
  -- Почему не так: «402 DEPLOYMENT_DISABLED», «таймаут 20 с»
  error text CHECK (length(error) <= 300)
);
CREATE INDEX site_health_checks_at_idx ON public.site_health_checks (checked_at DESC);

CREATE TABLE public.site_health_incidents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz CHECK (ended_at >= started_at),
  reason text NOT NULL DEFAULT '' CHECK (length(reason) <= 300),
  -- Когда написали «не открывается» и «снова открывается»; null — не писали
  alerted_at timestamptz,
  recovered_alerted_at timestamptz
);
-- Открытый сбой — один
CREATE UNIQUE INDEX site_health_incidents_open_idx ON public.site_health_incidents ((true)) WHERE ended_at IS NULL;
CREATE INDEX site_health_incidents_started_idx ON public.site_health_incidents (started_at DESC);

-- ── 2. Платные сервисы ───────────────────────────────────────────────────────
CREATE TABLE public.paid_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  plan text NOT NULL DEFAULT '' CHECK (length(plan) <= 80),
  -- Цена за период; null — не известна
  cost numeric(12, 2) CHECK (cost >= 0),
  currency text NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD', 'KZT', 'EUR', 'RUB')),
  -- month / year — подписка; usage — по факту расхода
  period text NOT NULL DEFAULT 'month' CHECK (period IN ('month', 'year', 'usage')),
  renews_on date,
  url text CHECK (url ~ '^https://' AND length(url) <= 300),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  -- Показание, которое сайт снимает сам: vercel, supabase, dataforseo, ai
  meter text CHECK (meter IN ('vercel', 'supabase', 'dataforseo', 'ai')),
  sort smallint NOT NULL DEFAULT 0,
  -- Для какой даты продления бот уже напомнил — второй раз не пишет
  reminded_for date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX paid_services_meter_idx ON public.paid_services (meter) WHERE meter IS NOT NULL;

-- Что известно на 21.11.2026. Цены, где не известны, — пустые: их вписывает владелец
INSERT INTO public.paid_services (name, plan, cost, currency, period, url, note, meter, sort) VALUES
  ('Vercel', 'Pro', 20, 'USD', 'month', 'https://vercel.com/dashboard', 'Хостинг сайта. Pro с 21.11.2026; сверх включённого в Pro — доплата за использование, смотреть в Usage.', 'vercel', 10),
  ('Supabase', 'Free', 0, 'USD', 'month', 'https://supabase.com/dashboard/project/gvsdevsvzgcivpphcuai/settings/billing/usage', 'База, файлы, функции. Трафик (Egress) — 5 ГБ в месяц на Free, виден только в панели.', 'supabase', 20),
  ('DataForSEO', '', NULL, 'USD', 'usage', 'https://app.dataforseo.com/', 'Спрос в Google: платится пополнением баланса.', 'dataforseo', 30),
  ('Модели ИИ', '', NULL, 'USD', 'usage', NULL, 'Чтение постов поставщиков и скриншотов Kaspi. Ключи и бюджет — на странице «Модели ИИ».', 'ai', 40),
  ('Домен uhti.kz', '', NULL, 'KZT', 'year', NULL, 'Впишите дату продления — бот напомнит за неделю.', NULL, 50);

ALTER TABLE public.site_health_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_health_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.paid_services ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_health_checks, public.site_health_incidents, public.paid_services FROM anon, authenticated;
GRANT ALL ON public.site_health_checks, public.site_health_incidents, public.paid_services TO service_role;

-- ── 3. Размер базы и файлов ──────────────────────────────────────────────────
CREATE FUNCTION public.site_health_storage()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'files_bytes', (SELECT coalesce(sum((metadata ->> 'size')::bigint), 0) FROM storage.objects))
$$;

-- ── 4. Расписание ────────────────────────────────────────────────────────────
CREATE FUNCTION public.site_watch_tick()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
DECLARE
  v_functions text;
  v_site text;
BEGIN
  SELECT value INTO v_functions FROM app_settings WHERE key = 'functions_url';
  SELECT value INTO v_site FROM app_settings WHERE key = 'site_watch_url';
  -- Выключить сторожа (например, на стенде): site_watch_url = 'off'
  IF v_site = 'off' THEN
    RETURN NULL;
  END IF;
  RETURN net.http_post(
    url := coalesce(v_functions, 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1') || '/site-watchdog',
    body := jsonb_build_object('site', coalesce(v_site, 'https://uhti.kz')),
    headers := public.internal_function_headers(),
    timeout_milliseconds := 60000);
END $$;

REVOKE EXECUTE ON FUNCTION public.site_health_storage() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.site_watch_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.site_health_storage() TO service_role;
GRANT EXECUTE ON FUNCTION public.site_watch_tick() TO service_role;

SELECT cron.schedule('Site Watchdog', '*/5 * * * *', $cron$SELECT public.site_watch_tick()$cron$);

-- ── 5. Проверка результата ───────────────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_health_checks', 'site_health_incidents', 'paid_services'] LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'у % не включён RLS', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'у % есть политики — таблица должна быть закрыта', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION '% доступна гостю или покупателю', t;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.site_health_storage()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.site_watch_tick()', 'EXECUTE') THEN
    RAISE EXCEPTION 'функции сторожа доступны гостю или покупателю';
  END IF;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'Site Watchdog') <> 1 THEN
    RAISE EXCEPTION 'задача «Site Watchdog» не одна';
  END IF;
END $$;
