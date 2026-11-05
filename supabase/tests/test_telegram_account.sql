-- Проверка аккаунта Telegram (миграция 20261104120000_telegram_account).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   docker exec -i supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -X -At \
--     < supabase/tests/test_telegram_account.sql
-- До применения — тем же файлом, подключив миграцию перед ним в одной
-- транзакции: `BEGIN; \i <миграция> \i <этот файл>` (откат в конце снимет и её).
--
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

-- Текст ошибки запроса или «без ошибки» — для проверок отказов.
CREATE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE q;
  RETURN 'без ошибки';
EXCEPTION WHEN OTHERS THEN
  RETURN SQLERRM;
END $$;

-- ── 1. Права ────────────────────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.telegram_account'::regclass),
                  'RLS у telegram_account включён');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'telegram_account'),
                  'политик нет — таблица закрыта');

SET LOCAL ROLE anon;
SELECT pg_temp.ok(pg_temp.err('SELECT * FROM public.telegram_account') LIKE '%permission denied%',
                  'гость не читает telegram_account');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_get(''session'')') LIKE '%permission denied%',
                  'гость не читает сессию');
SELECT pg_temp.ok(pg_temp.err('SELECT * FROM public.telegram_secrets_status()') LIKE '%permission denied%',
                  'гость не видит, какие секреты заданы');
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_get(''session'')') LIKE '%permission denied%',
                  'покупатель не читает сессию');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''session'', repeat(''x'', 40), NULL)') LIKE '%permission denied%',
                  'покупатель не подменяет сессию');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_delete(''session'')') LIKE '%permission denied%',
                  'покупатель не стирает сессию');
SELECT pg_temp.ok(pg_temp.err('INSERT INTO public.telegram_account (user_id, display_name) VALUES (1, ''x'')') LIKE '%permission denied%',
                  'покупатель не пишет telegram_account');
RESET ROLE;

-- ── 2. Секреты: запись, чтение, замена, удаление ────────────────────────────
SET LOCAL ROLE service_role;
SELECT public.telegram_secret_set('api_id', '1234567', NULL);
SELECT public.telegram_secret_set('api_hash', '0123456789abcdef0123456789abcdef', NULL);
SELECT public.telegram_secret_set('session', repeat('a', 300), NULL);
SELECT pg_temp.ok(public.telegram_secret_get('api_id') = '1234567', 'api_id читается сервером');
SELECT pg_temp.ok(public.telegram_secret_get('session') = repeat('a', 300), 'сессия читается сервером');

SELECT public.telegram_secret_set('session', '  ' || repeat('b', 300) || '  ', NULL);
SELECT pg_temp.ok(public.telegram_secret_get('session') = repeat('b', 300), 'повторная запись заменяет сессию, пробелы по краям срезаны');
SELECT pg_temp.ok((SELECT count(*) FROM vault.secrets WHERE name = 'telegram_session') = 1, 'сессия в Vault одна, не копится');

SELECT pg_temp.ok((SELECT array_agg(name ORDER BY name) FROM public.telegram_secrets_status()) = ARRAY['api_hash', 'api_id', 'session'],
                  'статус называет заданные секреты');
SELECT pg_temp.ok(pg_get_function_result('public.telegram_secrets_status()'::regprocedure) = 'TABLE(name text, updated_at timestamp with time zone)',
                  'статус без значений — только имя и время');

SELECT public.telegram_secret_delete('session');
SELECT pg_temp.ok(public.telegram_secret_get('session') IS NULL, 'сессия стирается');
SELECT pg_temp.ok(public.telegram_secret_get('api_id') = '1234567', 'стирание сессии не трогает api_id');

-- ── 3. Отказы ───────────────────────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''bot_token'', repeat(''x'', 40), NULL)') LIKE '%не предусмотрен%',
                  'чужое имя секрета — отказ');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''api_id'', ''12ab'', NULL)') LIKE '%не похоже%',
                  'api_id не числом — отказ');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''api_id'', ''0123'', NULL)') LIKE '%не похоже%',
                  'api_id с нуля — отказ');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''api_hash'', ''0123456789ABCDEF0123456789ABCDEF'', NULL)') LIKE '%не похоже%',
                  'api_hash заглавными — отказ (у Telegram он строчный)');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''api_hash'', ''0123456789abcdef'', NULL)') LIKE '%не похоже%',
                  'короткий api_hash — отказ');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''session'', ''short'', NULL)') LIKE '%не похоже%',
                  'слишком короткая сессия — отказ');
SELECT pg_temp.ok(pg_temp.err('SELECT public.telegram_secret_set(''login'', NULL, NULL)') LIKE '%не похоже%',
                  'пустое значение — отказ');

-- Префикс не выводит к чужим секретам Vault
SELECT vault.create_secret('чужой ключ', 'telegram_other', 'не Telegram-секрет этой миграции');
SELECT pg_temp.ok(public.telegram_secret_get('other') IS NULL, 'чужое имя не читается');
SELECT public.telegram_secret_delete('other');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'telegram_other'), 'чужое имя не стирается');

-- ── 4. Аккаунт — одна строка ────────────────────────────────────────────────
INSERT INTO public.telegram_account (user_id, display_name, username, phone_last4) VALUES (777000, 'Закуп', 'uhti_zakup', '4567');
SELECT pg_temp.ok(pg_temp.err('INSERT INTO public.telegram_account (user_id, display_name) VALUES (1, ''второй'')') LIKE '%duplicate key%',
                  'второго аккаунта нет — строка одна');
SELECT pg_temp.ok(pg_temp.err('UPDATE public.telegram_account SET phone_last4 = ''45678''') LIKE '%violates check%',
                  'от телефона — только 4 цифры');
SELECT pg_temp.ok(pg_temp.err('UPDATE public.telegram_account SET username = ''не латиницей''') LIKE '%violates check%',
                  'username — как у Telegram');
RESET ROLE;

ROLLBACK;
