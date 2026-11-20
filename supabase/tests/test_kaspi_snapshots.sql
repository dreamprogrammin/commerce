-- Цифры Kaspi (миграция 20261120120000_kaspi_snapshots).
--
-- Только на ЛОКАЛЬНОЙ базе:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_kaspi_snapshots.sql
-- До применения — `BEGIN; \i <миграция> \i <этот файл>`. Всё откатывается.

\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.ok(cond boolean, what text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ПРОВАЛ: %', what;
  END IF;
  RETURN 'ок  ' || what;
END $$;
CREATE FUNCTION pg_temp.fails(sql text, pattern text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE sql;
  RETURN false;
EXCEPTION WHEN others THEN
  RETURN SQLERRM LIKE pattern;
END $$;

INSERT INTO public.suppliers (name) VALUES ('Проверка цифр Kaspi') RETURNING id AS sup \gset
INSERT INTO public.supplier_channels (supplier_id, title, chat_type, username)
VALUES (:'sup', 'Проверка цифр Kaspi', 'channel', 'probe_kaspi') RETURNING id AS ch \gset
INSERT INTO public.supplier_offers (channel_id, message_id, posted_at, post_url)
VALUES (:'ch', 1, now(), 'https://t.me/probe_kaspi/1') RETURNING id AS offer \gset
INSERT INTO public.market_demand_topics (name, keywords) VALUES ('Проверка Kaspi', ARRAY['проверка kaspi игрушка']) RETURNING id AS topic \gset

SELECT pg_temp.ok(NOT pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, reviews, source, kaspi_url) VALUES (%L, 10, 'page', 'https://kaspi.kz/shop/p/a/')$q$, :'topic'), '%'),
  'замер у темы');
SELECT pg_temp.ok(NOT pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (offer_id, offer_item, price, rating, source) VALUES (%L, 1, 12990, 4.8, 'screenshot')$q$, :'offer'), '%'),
  'замер у второго товара поста');
SELECT pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, offer_id, reviews, source) VALUES (%L, %L, 1, 'page')$q$, :'topic', :'offer'), '%check constraint%'),
  'тема и товар разом — нельзя');
SELECT pg_temp.ok(pg_temp.fails($q$INSERT INTO public.kaspi_snapshots (reviews, source) VALUES (1, 'page')$q$, '%check constraint%'),
  'без цели — нельзя');
SELECT pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, source) VALUES (%L, 'page')$q$, :'topic'), '%check constraint%'),
  'без единой цифры — нельзя');
SELECT pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, reviews, source, kaspi_url) VALUES (%L, 1, 'page', 'https://evil.kz/')$q$, :'topic'), '%check constraint%'),
  'чужой сайт в ссылке — нельзя');
SELECT pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, offer_item, reviews, source) VALUES (%L, 0, 1, 'page')$q$, :'topic'), '%check constraint%'),
  'номер товара без товара поставщика — нельзя');
SELECT pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, rating, source) VALUES (%L, 5.5, 'page')$q$, :'topic'), '%'),
  'рейтинг выше 5 — нельзя');
SELECT pg_temp.ok(pg_temp.fails(format($q$INSERT INTO public.kaspi_snapshots (topic_id, reviews, source) VALUES (%L, 1, 'robot')$q$, :'topic'), '%check constraint%'),
  'неизвестный источник — нельзя');

-- Удалили товар поставщика или тему — замеры уходят с ними
DELETE FROM public.supplier_offers WHERE id = :'offer';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.kaspi_snapshots WHERE offer_id = :'offer'), 'замеры удалённого товара удалены');
DELETE FROM public.market_demand_topics WHERE id = :'topic';
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.kaspi_snapshots WHERE topic_id = :'topic'), 'замеры удалённой темы удалены');

-- Гость и покупатель таблицу не видят
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok(pg_temp.fails('SELECT 1 FROM public.kaspi_snapshots', '%permission denied%'), 'покупателю закрыто');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.ok(pg_temp.fails('SELECT 1 FROM public.kaspi_snapshots', '%permission denied%'), 'гостю закрыто');
RESET ROLE;

ROLLBACK;
