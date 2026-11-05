-- Проверка каналов поставщиков в Telegram (миграция 20261103120000_supplier_channels).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   docker exec -i supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -X -At \
--     < supabase/tests/test_supplier_channels.sql
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

INSERT INTO public.suppliers (id, name) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'Проверка каналов А'),
  ('00000000-0000-4000-8000-0000000000a2', 'Проверка каналов Б');

-- ── 1. Права ────────────────────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.supplier_channels'::regclass),
                  'RLS включён');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_channels'),
                  'политик нет — таблица закрыта');
SELECT pg_temp.ok(NOT has_table_privilege('anon', 'public.supplier_channels', 'SELECT')
                  AND NOT has_table_privilege('anon', 'public.supplier_channels', 'INSERT'),
                  'гостю ни читать, ни писать');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated', 'public.supplier_channels', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.supplier_channels', 'INSERT')
                  AND NOT has_table_privilege('authenticated', 'public.supplier_channels', 'DELETE'),
                  'покупателю ни читать, ни писать, ни удалять');
SELECT pg_temp.ok(has_table_privilege('service_role', 'public.supplier_channels', 'SELECT')
                  AND has_table_privilege('service_role', 'public.supplier_channels', 'INSERT')
                  AND has_table_privilege('service_role', 'public.supplier_channels', 'DELETE'),
                  'сервер админки (service_role) читает, пишет и удаляет');

-- Под ролью покупателя — отказ прав, а не пустой ответ
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM 1 FROM public.supplier_channels;
  RAISE EXCEPTION 'ПРОВАЛ: покупатель прочитал supplier_channels';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;
SELECT 'ок  покупатель на чтение получает permission denied';

-- ── 2. Запись ───────────────────────────────────────────────────────────────
INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type, web_preview)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'amrtoys_opt', 'AmrToys опт', 'channel', true);
INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type)
VALUES ('00000000-0000-4000-8000-0000000000a1', 'Qw3rTy_-12345678', 'Закрытый канал', 'channel');
INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
VALUES ('00000000-0000-4000-8000-0000000000a2', 'toys_chat', 'Чат оптовиков', 'group');
SELECT pg_temp.ok((SELECT count(*) FROM public.supplier_channels
                   WHERE supplier_id IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')) = 3,
                  'открытый канал, канал по приглашению и группа записаны');
SELECT pg_temp.ok((SELECT checked_at IS NOT NULL AND created_at IS NOT NULL AND NOT web_preview
                   FROM public.supplier_channels WHERE invite_hash = 'Qw3rTy_-12345678'),
                  'время проверки ставится само, просмотр без аккаунта по умолчанию — нет');

-- ── 3. Отказы ───────────────────────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a2', 'amrtoys_opt', 'Чужой', 'channel')$q$)
  LIKE '%supplier_channels_username_key%', 'тот же канал у второго поставщика — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'AmrToys_Opt2', 'Регистр', 'channel')$q$)
  LIKE '%supplier_channels_username_check%', 'имя не в нижнем регистре — отказ (сервер пишет в нижнем)');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a1', '1toys', 'С цифры', 'channel')$q$)
  LIKE '%supplier_channels_username_check%', 'имя с цифры — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a2', 'Qw3rTy_-12345678', 'Тот же', 'channel')$q$)
  LIKE '%supplier_channels_invite_hash_key%', 'то же приглашение у второго поставщика — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a2', 'qw3rty_-12345678', 'Другой регистр', 'channel')$q$)
  = 'без ошибки', 'приглашение в другом регистре — другой код, записывается');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'Пусто', 'channel')$q$)
  LIKE '%supplier_channels_one_link%', 'ни имени, ни приглашения — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, invite_hash, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'both_set', 'Zz9Zz9Zz9Zz9Zz9Z', 'Оба', 'channel')$q$)
  LIKE '%supplier_channels_one_link%', 'имя и приглашение сразу — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, invite_hash, title, chat_type, web_preview)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'Yy8Yy8Yy8Yy8Yy8Y', 'Закрытый', 'channel', true)$q$)
  LIKE '%supplier_channels_preview_public%', 'закрытый канал «читается без аккаунта» — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type, web_preview)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'some_group', 'Группа', 'group', true)$q$)
  LIKE '%supplier_channels_preview_public%', 'группа «читается без аккаунта» — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'some_user', 'Человек', 'user')$q$)
  LIKE '%supplier_channels_chat_type_check%', 'не канал и не группа — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000a1', 'blank_title', '   ', 'channel')$q$)
  LIKE '%supplier_channels_title_check%', 'пустое название — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_channels (supplier_id, username, title, chat_type)
  VALUES ('00000000-0000-4000-8000-0000000000ff', 'no_supplier', 'Ничей', 'channel')$q$)
  LIKE '%supplier_channels_supplier_id_fkey%', 'несуществующий поставщик — отказ');

-- ── 4. Удаление поставщика ──────────────────────────────────────────────────
DELETE FROM public.suppliers WHERE id = '00000000-0000-4000-8000-0000000000a1';
SELECT pg_temp.ok((SELECT count(*) FROM public.supplier_channels
                   WHERE supplier_id = '00000000-0000-4000-8000-0000000000a1') = 0,
                  'удаление поставщика удаляет его каналы');
SELECT pg_temp.ok((SELECT count(*) FROM public.supplier_channels
                   WHERE supplier_id = '00000000-0000-4000-8000-0000000000a2') = 2,
                  'каналы другого поставщика на месте');

ROLLBACK;
