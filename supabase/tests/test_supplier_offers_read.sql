-- Проверка чтения ИИ в «Товарах поставщиков» (миграция 20261105120000_supplier_offers_read).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   docker exec -i supabase_db_gvsdevsvzgcivpphcuai psql -U postgres -X -At \
--     < supabase/tests/test_supplier_offers_read.sql
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

-- Сводка считает все товары базы — свои строки проверяются приростом к тому, что было
CREATE TEMP TABLE before_summary AS SELECT public.supplier_offers_read_summary() AS s;

INSERT INTO public.suppliers (id, name) VALUES ('00000000-0000-4000-8000-0000000000b1', 'Проверка чтения ИИ');
INSERT INTO public.supplier_channels (id, supplier_id, username, title, chat_type, web_preview) VALUES
  ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-0000000000b1', 'probe_read_open', 'Проверка чтения', 'channel', true);
INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, caption, post_url, photo_path, photo_url, status) VALUES
  ('00000000-0000-4000-8000-0000000000c1', 1, now() - interval '1 hour', 'Кукла', 'https://t.me/probe_read_open/1', 'c1/1.jpg', 'http://x/1', 'new'),
  ('00000000-0000-4000-8000-0000000000c1', 2, now() - interval '2 hours', 'Набор', 'https://t.me/probe_read_open/2', 'c1/2.jpg', 'http://x/2', 'new'),
  ('00000000-0000-4000-8000-0000000000c1', 3, now() - interval '3 hours', 'Машинка', 'https://t.me/probe_read_open/3', 'c1/3.jpg', 'http://x/3', 'new'),
  ('00000000-0000-4000-8000-0000000000c1', 4, now() - interval '4 hours', 'Без фото', 'https://t.me/probe_read_open/4', NULL, NULL, 'new'),
  ('00000000-0000-4000-8000-0000000000c1', 5, now() - interval '5 hours', 'Разобран', 'https://t.me/probe_read_open/5', 'c1/5.jpg', 'http://x/5', 'skipped'),
  ('00000000-0000-4000-8000-0000000000c1', 6, now() - interval '40 days', 'Старый', 'https://t.me/probe_read_open/6', 'c1/6.jpg', 'http://x/6', 'new');

-- ── 1. Колонки и ограничения ────────────────────────────────────────────────
SELECT pg_temp.ok((SELECT read_items IS NULL AND read_model IS NULL AND read_at IS NULL AND read_error IS NULL
                   FROM public.supplier_offers WHERE message_id = 1 AND channel_id = '00000000-0000-4000-8000-0000000000c1'),
                  'новый товар — не прочитан: все read_* пустые');

UPDATE public.supplier_offers
SET read_items = '[{"name": "Кукла", "article": "039", "price_text": 2400, "price_image": null}]',
    read_model = 'anthropic/claude-haiku-5-5', read_at = now(), read_input_tokens = 2000, read_output_tokens = 300
WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 1;
SELECT 'ок  прочитанный товар записывается';

UPDATE public.supplier_offers
SET read_model = 'anthropic/claude-haiku-5-5', read_at = now(), read_error = 'Лимит запросов провайдера — прочитайте позже'
WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 2;
SELECT 'ок  непрочитанный — с причиной';

-- Прочитанный и уже разобранный («Не брать») — его токены тоже в расходе
UPDATE public.supplier_offers
SET read_items = '[]', read_model = 'anthropic/claude-sonnet-5-5', read_at = now(), read_input_tokens = 1000, read_output_tokens = 100
WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 5;

SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_offers SET read_items = '{"items": []}', read_model = 'm', read_at = now()
                                 WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 3$q$) LIKE '%check constraint%',
                  'товары — только массивом');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_offers SET read_at = now()
                                 WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 3$q$) LIKE '%supplier_offers_read_attempt%',
                  'время чтения без модели — отказ');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_offers SET read_error = 'сбой'
                                 WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 1$q$) LIKE '%supplier_offers_read_outcome%',
                  'прочитан и с ошибкой сразу — отказ');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_offers SET read_error = repeat('я', 501), read_model = 'm', read_at = now()
                                 WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 3$q$) LIKE '%check constraint%',
                  'причина длиннее 500 знаков — отказ');
SELECT pg_temp.ok(pg_temp.err($q$UPDATE public.supplier_offers SET read_input_tokens = -1
                                 WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 1$q$) LIKE '%check constraint%',
                  'отрицательные токены — отказ');

-- ── 2. Сводка ───────────────────────────────────────────────────────────────
-- Из своих: не прочитаны 2 и 3 (товар 2 — с ошибкой); 4 без фото, 5 разобран,
-- 6 старше 30 дней — не в счёт
SELECT pg_temp.ok((public.supplier_offers_read_summary()->>'unread')::int - (SELECT (s->>'unread')::int FROM before_summary) = 2,
                  'не прочитано — новые с фото за 30 дней: без фото, разобранные и старые не в счёт');
SELECT pg_temp.ok((public.supplier_offers_read_summary()->>'failed')::int - (SELECT (s->>'failed')::int FROM before_summary) = 1,
                  'не прочлось — те из них, у кого есть причина');

UPDATE public.supplier_offers SET read_items = '[]', read_model = 'anthropic/claude-haiku-5-5', read_at = now() - interval '31 days'
WHERE channel_id = '00000000-0000-4000-8000-0000000000c1' AND message_id = 6;
CREATE TEMP TABLE models AS
  SELECT m->>'model' AS model, (m->>'posts')::int AS posts, (m->>'inputTokens')::bigint AS input_tokens, (m->>'outputTokens')::bigint AS output_tokens
  FROM jsonb_array_elements(public.supplier_offers_read_summary()->'models') m;
CREATE TEMP TABLE models_before AS
  SELECT m->>'model' AS model, (m->>'posts')::int AS posts, (m->>'inputTokens')::bigint AS input_tokens, (m->>'outputTokens')::bigint AS output_tokens
  FROM jsonb_array_elements((SELECT s FROM before_summary)->'models') m;
SELECT pg_temp.ok((SELECT n.posts - coalesce(b.posts, 0) = 1 AND n.input_tokens - coalesce(b.input_tokens, 0) = 2000
                          AND n.output_tokens - coalesce(b.output_tokens, 0) = 300
                   FROM models n LEFT JOIN models_before b USING (model) WHERE n.model = 'anthropic/claude-haiku-5-5'),
                  'расход Haiku: одно удачное чтение, его токены; чтение старше 30 дней и неудачное не в счёт');
SELECT pg_temp.ok((SELECT n.posts - coalesce(b.posts, 0) = 1 AND n.input_tokens - coalesce(b.input_tokens, 0) = 1000
                   FROM models n LEFT JOIN models_before b USING (model) WHERE n.model = 'anthropic/claude-sonnet-5-5'),
                  'расход по каждой модели отдельно, разобранные товары — тоже');

-- ── 3. Права ────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.supplier_offers_read_summary()', 'EXECUTE')
                  AND NOT has_function_privilege('authenticated', 'public.supplier_offers_read_summary()', 'EXECUTE')
                  AND has_function_privilege('service_role', 'public.supplier_offers_read_summary()', 'EXECUTE'),
                  'сводка чтения — только серверу');
SELECT pg_temp.ok(NOT has_column_privilege('authenticated', 'public.supplier_offers', 'read_items', 'SELECT')
                  AND NOT has_column_privilege('anon', 'public.supplier_offers', 'read_items', 'SELECT'),
                  'прочитанное гостю и покупателю не видно');

ROLLBACK;
