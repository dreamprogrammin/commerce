-- Общий секрет базы и эдж-функций — заголовок x-internal-secret (19 октября 2026).
--
-- Зачем. Функции, которые зовёт база — триггеры заказов и вопросов, расписание
-- дайджестов, — стоят с verify_jwt = false: pg_net ходит без ключа. Защитой
-- была проверка «в User-Agent есть pg_net», а она подделывается одной строкой.
-- Через sync-order-status-to-telegram можно было переписать любое сообщение
-- бота в чате магазина (id сообщения и статус берутся из тела) и разослать
-- покупателям письма о статусе; через send-user-telegram — написать от имени
-- бота любому chat_id. Нашлось 19 октября 2026, на локальной базе — она звала
-- боевые функции и проходила эту проверку сама.
--
-- Что здесь. В Vault заводится случайный секрет `internal_functions_secret`:
-- значение рождается тут же и в git не попадает. Семь функций-триггеров и три
-- задания расписания начинают слать его заголовком x-internal-secret через
-- public.internal_function_headers(). Эдж-функции сверяют заголовок с
-- INTERNAL_FUNCTIONS_SECRET в своём окружении (_shared/internalAuth.ts) —
-- когда он там заведён; до того ведут себя как раньше.
--
-- ПОРЯДОК: эта миграция → выкатка функций → секрет в окружение функций (он и
-- включает проверку). Секрет в окружении раньше миграции ломает уведомления:
-- функции потребуют заголовок, которого триггеры ещё не шлют.
--
-- Тела функций не переписываются из файлов: берутся из самой базы
-- (pg_get_functiondef) и правятся точечной заменой выражения headers. Страж
-- сверяет их с боевыми на 19.10.2026 по md5 — с поправкой на адрес функций:
-- на локальной базе он перенаправлен на http://kong:8000 (иначе локальные
-- заказы уходили на бой), в остальном тела те же.

-- 1. Страж: база та, под которую готовилось.
DO $$
DECLARE
  prod_url constant text := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1';
  local_url constant text := 'http://kong:8000/functions/v1';
  expected constant jsonb := '{
    "notify_guest_checkout_to_telegram": "3835e79286f73c79715191a6ec932585",
    "notify_order_subscriber": "2662922695ba236f101257fd76a40d85",
    "notify_question_answered": "f05c6a9a194aa0c85f1fbfb2ede9040e",
    "notify_telegram_order_cancelled": "b99a47a878a88ac0cb5c8306214d74a7",
    "notify_user_order_to_telegram": "4eba24644aa72897c5fb4efe3c15136b",
    "sync_order_status_to_telegram": "fdc72c561fe9bce79be334fafc90c013",
    "trigger_send_telegram_notification": "7b44462ff896b928223216b473abffba"
  }';
  expected_cron constant jsonb := '{
    "sales-digest-evening": "4b007ce6fbe68322048cb19abd375829",
    "sales-digest-morning": "58eac73e03239e06d542132a384c3f27",
    "weekly-team-report": "3c255abd0910ded2fd6a935f1ee24eb5"
  }';
  r record;
  actual text;
BEGIN
  FOR r IN SELECT key, value FROM jsonb_each_text(expected) LOOP
    SELECT md5(replace(pg_get_functiondef(p.oid), local_url, prod_url)) INTO actual
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = r.key;
    IF actual IS DISTINCT FROM r.value THEN
      RAISE EXCEPTION '%: тело не то (md5 %), снято с прода 19.10.2026', r.key, actual;
    END IF;
  END LOOP;

  FOR r IN SELECT key, value FROM jsonb_each_text(expected_cron) LOOP
    SELECT md5(replace(command, local_url, prod_url)) INTO actual FROM cron.job WHERE jobname = r.key;
    IF actual IS DISTINCT FROM r.value THEN
      RAISE EXCEPTION 'расписание %: команда не та (md5 %), снята с прода 19.10.2026', r.key, actual;
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_functions_secret') THEN
    RAISE EXCEPTION 'секрет internal_functions_secret уже есть — миграция не для этой базы';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'internal_function_headers'
  ) THEN
    RAISE EXCEPTION 'internal_function_headers уже есть — миграция не для этой базы';
  END IF;
END $$;

-- 2. Секрет: случайный, рождается здесь.
SELECT vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'internal_functions_secret',
  'x-internal-secret: база → эдж-функции (триггеры, расписание). То же значение — INTERNAL_FUNCTIONS_SECRET в окружении функций.'
);

-- 3. Заголовки вызова функции — с секретом.
CREATE FUNCTION public.internal_function_headers()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'Content-Type', 'application/json',
    'x-internal-secret', coalesce(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_functions_secret'),
      ''
    )
  )
$$;

COMMENT ON FUNCTION public.internal_function_headers() IS
  'Заголовки для net.http_post к эдж-функциям: Content-Type и x-internal-secret из Vault. Только для функций базы — anon и authenticated получили бы секрет.';

-- Звать его могут только функции базы и расписание (владелец — postgres):
-- через REST anon и authenticated иначе прочли бы секрет.
REVOKE ALL ON FUNCTION public.internal_function_headers() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_function_headers() FROM anon, authenticated;

-- 4. Функции-триггеры: выражение headers → помощник.
DO $$
DECLARE
  fn text;
  def text;
  patched text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'notify_guest_checkout_to_telegram',
    'notify_order_subscriber',
    'notify_question_answered',
    'notify_telegram_order_cancelled',
    'notify_user_order_to_telegram',
    'trigger_send_telegram_notification'
  ] LOOP
    SELECT pg_get_functiondef(p.oid) INTO def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = fn;

    -- jsonb_build_object(...) с одним уровнем вложенных скобок: у
    -- notify_question_answered внутри current_setting(...).
    patched := regexp_replace(
      def,
      'headers\s*:=\s*jsonb_build_object\((?:[^()]|\([^()]*\))*\)',
      'headers := public.internal_function_headers()'
    );
    IF (length(patched) - length(replace(patched, 'internal_function_headers', '')))
       / length('internal_function_headers') <> 1 THEN
      RAISE EXCEPTION '%: заголовки не заменены ровно один раз', fn;
    END IF;
    EXECUTE patched;
  END LOOP;

  -- Синхронизация статуса: заголовков не было вовсе. Плюс SECURITY DEFINER —
  -- помощник доступен только владельцу, а триггер срабатывает от имени того,
  -- кто меняет заказ.
  SELECT pg_get_functiondef('public.sync_order_status_to_telegram'::regproc) INTO def;
  patched := regexp_replace(
    def,
    '(PERFORM net\.http_post\(\s*url\s*:=\s*[^,]+,)',
    E'\\1\n            headers := public.internal_function_headers(),'
  );
  patched := replace(
    patched,
    E'\n LANGUAGE plpgsql\nAS ',
    E'\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO ''public''\nAS '
  );
  IF patched NOT LIKE '%internal_function_headers%' OR patched NOT LIKE '%SECURITY DEFINER%' THEN
    RAISE EXCEPTION 'sync_order_status_to_telegram: не пропатчено';
  END IF;
  EXECUTE patched;
END $$;

-- 5. Расписание: те же заголовки.
DO $$
DECLARE
  r record;
  patched text;
BEGIN
  FOR r IN
    SELECT jobid, jobname, command FROM cron.job
    WHERE jobname IN ('sales-digest-evening', 'sales-digest-morning', 'weekly-team-report')
  LOOP
    patched := regexp_replace(
      r.command,
      'headers\s*:=\s*jsonb_build_object\((?:[^()]|\([^()]*\))*\)',
      'headers := public.internal_function_headers()'
    );
    IF patched = r.command THEN
      RAISE EXCEPTION 'расписание %: заголовки не заменены', r.jobname;
    END IF;
    PERFORM cron.alter_job(r.jobid, command := patched);
  END LOOP;
END $$;

-- 6. Проверка результата.
DO $$
DECLARE
  bare int;
  bare_cron int;
BEGIN
  SELECT count(*) INTO bare
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) LIKE '%functions/v1%'
    AND pg_get_functiondef(p.oid) NOT LIKE '%internal_function_headers%';
  SELECT count(*) INTO bare_cron
  FROM cron.job WHERE command LIKE '%functions/v1%' AND command NOT LIKE '%internal_function_headers%';
  IF bare > 0 OR bare_cron > 0 THEN
    RAISE EXCEPTION 'вызовы функций без секрета остались: функций %, заданий %', bare, bare_cron;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sync_order_status_to_telegram' AND p.prosecdef
  ) THEN
    RAISE EXCEPTION 'sync_order_status_to_telegram не SECURITY DEFINER';
  END IF;

  IF has_function_privilege('anon', 'public.internal_function_headers()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.internal_function_headers()', 'EXECUTE') THEN
    RAISE EXCEPTION 'internal_function_headers доступен anon/authenticated';
  END IF;

  IF length(public.internal_function_headers() ->> 'x-internal-secret') <> 64 THEN
    RAISE EXCEPTION 'секрет из Vault не читается';
  END IF;
END $$;
