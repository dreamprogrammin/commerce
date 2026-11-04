-- Проверка «Товаров поставщиков» (миграция 20261104160000_supplier_offers).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   docker exec -i supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -X -At \
--     < supabase/tests/test_supplier_offers.sql
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

INSERT INTO public.suppliers (id, name) VALUES ('00000000-0000-4000-8000-0000000000b1', 'Проверка товаров поставщиков');
INSERT INTO public.supplier_channels (id, supplier_id, username, title, chat_type, web_preview) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'probe_offers_open', 'Проверка — открытый', 'channel', true);
INSERT INTO public.supplier_channels (id, supplier_id, invite_hash, title, chat_type) VALUES
  ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-0000000000b1', 'ProbeOffersClosed1', 'Проверка — закрытый', 'channel');

-- ── 1. Права ────────────────────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.supplier_offers'::regclass),
                  'RLS включён');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'supplier_offers'),
                  'политик нет — таблица закрыта');
SELECT pg_temp.ok(NOT has_table_privilege('anon', 'public.supplier_offers', 'SELECT')
                  AND NOT has_table_privilege('anon', 'public.supplier_offers', 'INSERT')
                  AND NOT has_table_privilege('authenticated', 'public.supplier_offers', 'SELECT')
                  AND NOT has_table_privilege('authenticated', 'public.supplier_offers', 'UPDATE'),
                  'гостю и покупателю ни читать, ни писать');
SELECT pg_temp.ok(has_table_privilege('service_role', 'public.supplier_offers', 'SELECT')
                  AND has_table_privilege('service_role', 'public.supplier_offers', 'INSERT')
                  AND has_table_privilege('service_role', 'public.supplier_offers', 'UPDATE')
                  AND has_table_privilege('service_role', 'public.supplier_offers', 'DELETE'),
                  'сервер админки (service_role) читает, пишет и удаляет');
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.supplier_offers_summary()', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.supplier_offers_summary()', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.supplier_offers_summary()', 'EXECUTE'),
                  'сводка — только серверу');
SELECT pg_temp.ok((SELECT NOT public AND file_size_limit = 2097152 AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
                   FROM storage.buckets WHERE id = 'supplier-photos'),
                  'бакет supplier-photos закрытый, до 2 МБ, только картинки');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'
                              AND (qual ILIKE '%supplier-photos%' OR with_check ILIKE '%supplier-photos%')),
                  'политик на файлы бакета нет — кладёт и подписывает только сервер');

SET LOCAL ROLE authenticated;
DO $$
BEGIN
  PERFORM 1 FROM public.supplier_offers;
  RAISE EXCEPTION 'ПРОВАЛ: покупатель прочитал supplier_offers';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;
SELECT 'ок  покупателю — отказ прав, а не пустой ответ';

-- ── 2. Строки ───────────────────────────────────────────────────────────────
INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, caption, post_url, photo_path, photo_url, photo_count) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 101, now() - interval '1 hour', 'Кукла', 'https://t.me/probe_offers_open/101',
   '00000000-0000-4000-8000-0000000000c1/101.jpg', 'http://127.0.0.1:54321/storage/v1/object/sign/supplier-photos/x?token=y', 1),
  ('00000000-0000-4000-8000-0000000000c2', 7, now() - interval '2 days', 'Набор', 'https://t.me/c/1000000001/7', NULL, NULL, 3),
  ('00000000-0000-4000-8000-0000000000c2', 8, now() - interval '40 days', 'Старое', 'https://t.me/c/1000000001/8', NULL, NULL, 1);
SELECT pg_temp.ok((SELECT status = 'new' AND status_at IS NULL AND created_at IS NOT NULL FROM public.supplier_offers WHERE message_id = 101),
                  'новый товар — статус new');

SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url)
                                 VALUES ('00000000-0000-4000-8000-0000000000c1', 101, now(), 'https://t.me/x/101')$q$) LIKE '%duplicate key%',
                  'тот же пост канала второй раз — отказ (сборщик его пропускает)');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url)
                                 VALUES ('00000000-0000-4000-8000-0000000000c1', 102, now(), 'https://evil.example/102')$q$) LIKE '%check constraint%',
                  'ссылка не на t.me — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url, photo_path)
                                 VALUES ('00000000-0000-4000-8000-0000000000c1', 103, now(), 'https://t.me/x/103', 'a/103.jpg')$q$) LIKE '%check constraint%',
                  'путь фото без ссылки на него — отказ');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_offers SET status = 'ordered' WHERE message_id = 101$q$) LIKE '%check constraint%',
                  'неизвестный статус — отказ');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url, photo_count)
                                 VALUES ('00000000-0000-4000-8000-0000000000c1', 104, now(), 'https://t.me/x/104', 0)$q$) LIKE '%check constraint%',
                  'товар без фото — отказ: товар и есть фото');

-- ── 3. Сводка ───────────────────────────────────────────────────────────────
UPDATE public.supplier_offers SET status = 'added', status_at = now() WHERE message_id = 7;
UPDATE public.supplier_channels SET collected_up_to = 101, collected_at = '2026-11-04T09:00:00Z' WHERE id = '00000000-0000-4000-8000-0000000000c1';
SELECT pg_temp.ok(public.supplier_offers_summary() @> '{"fresh": 1, "added": 1, "skipped": 0}'
                  AND (public.supplier_offers_summary()->>'collectedAt')::timestamptz >= '2026-11-04T09:00:00Z',
                  'сводка: старше 30 дней не считается, последний сбор — по каналам');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_channels SET collected_up_to = 0 WHERE id = '00000000-0000-4000-8000-0000000000c1'$q$) LIKE '%check constraint%',
                  'прочитано до сообщения 0 — отказ');

-- ── 4. Канал удалён — его товары тоже ──────────────────────────────────────
DELETE FROM public.supplier_channels WHERE id = '00000000-0000-4000-8000-0000000000c2';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.supplier_offers WHERE channel_id = '00000000-0000-4000-8000-0000000000c2'),
                  'канал убрали — его товары ушли каскадом');

ROLLBACK;
