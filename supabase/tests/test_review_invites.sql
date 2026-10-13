-- Проверка отзывов по ссылке из письма (миграция 20261013120000_review_invites).
--
-- Только на ЛОКАЛЬНОЙ базе, где миграция уже применена:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -At \
--     -f supabase/tests/test_review_invites.sql
-- До применения миграции — тем же файлом, подключив её перед ним в одной
-- транзакции: `BEGIN; \i <миграция> \i <этот файл>` (откат в конце снимет и её).
--
-- Всё идёт в одной транзакции и откатывается: после прогона база прежняя.
-- Проваленная проверка останавливает прогон с текстом «ПРОВАЛ: …».
--
-- ⚠️ Триггеры заказов и уведомлений на локальной базе стучатся в БОЕВЫЕ
-- эдж-функции: адрес прода зашит в их тела (docs/HANDOFF.md). Внутри
-- транзакции они выключены. Не убирать: тестовый заказ ушёл бы в рабочий
-- Telegram, как только кто-нибудь заменит откат на фиксацию.

\set ON_ERROR_STOP 1
BEGIN;

ALTER TABLE public.orders DISABLE TRIGGER USER;
ALTER TABLE public.guest_checkouts DISABLE TRIGGER USER;
ALTER TABLE public.notifications DISABLE TRIGGER USER;

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

-- ── Данные ──────────────────────────────────────────────────────────────────
SELECT (array_agg(id ORDER BY name, id))[1] AS prod_a,
       (array_agg(id ORDER BY name, id))[2] AS prod_b,
       (array_agg(name ORDER BY name, id))[1] AS prod_a_name,
       (array_agg(name ORDER BY name, id))[2] AS prod_b_name
FROM public.products \gset
SELECT category_id AS cat_a FROM public.products WHERE id = :'prod_a' \gset
INSERT INTO public.brands (name, slug) VALUES ('Бренд проверки отзывов', 'test-review-invites-brand')
RETURNING id AS brand_id \gset
UPDATE public.products SET brand_id = :'brand_id' WHERE id = :'prod_a';

-- Гость: доставлен; товар A двумя строками (ссылка всё равно одна), товар B.
INSERT INTO public.guest_checkouts (guest_name, guest_email, guest_phone, total_amount, final_amount, delivery_method, status)
VALUES ('  Айгерим   Нурланова ', 'guest@example.test', '+77000000000', 3000, 3000, 'pickup', 'delivered')
RETURNING id AS gc \gset
INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
VALUES (:'gc', :'prod_a', 1, 1000), (:'gc', :'prod_a', 1, 1000), (:'gc', :'prod_b', 1, 1000);

-- Гость: ещё не доставлен.
INSERT INTO public.guest_checkouts (guest_name, guest_email, guest_phone, total_amount, final_amount, delivery_method, status)
VALUES ('Ерлан', 'guest2@example.test', '+77000000001', 1000, 1000, 'pickup', 'confirmed')
RETURNING id AS gc_open \gset
INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
VALUES (:'gc_open', :'prod_a', 1, 1000);

-- Гость без имени (одни пробелы) — на сайте «Покупатель».
INSERT INTO public.guest_checkouts (guest_name, guest_email, guest_phone, total_amount, final_amount, delivery_method, status)
VALUES ('   ', 'guest3@example.test', '+77000000002', 1000, 1000, 'pickup', 'delivered')
RETURNING id AS gc_noname \gset
INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
VALUES (:'gc_noname', :'prod_b', 1, 1000);

-- Покупатель с аккаунтом: доставлен A и B, на B отзыв уже написан на сайте.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES (gen_random_uuid(), 'buyer@example.test', '{"full_name": "Малик Тестов"}')
RETURNING id AS uid \gset
INSERT INTO public.profiles (id) VALUES (:'uid') ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET first_name = 'Малик', last_name = 'Тестов' WHERE id = :'uid';
INSERT INTO public.orders (user_id, total_amount, final_amount, delivery_method, status)
VALUES (:'uid', 2000, 2000, 'pickup', 'delivered')
RETURNING id AS ord \gset
INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase)
VALUES (:'ord', :'prod_a', 1, 1000), (:'ord', :'prod_b', 1, 1000);
INSERT INTO public.product_reviews (user_id, product_id, order_id, rating, text, is_published)
VALUES (:'uid', :'prod_b', :'ord', 5, 'Уже писал на сайте', true);

-- ── Выпуск ссылок ───────────────────────────────────────────────────────────
SELECT count(*) AS n,
       string_agg(product_name, '|') AS names,
       bool_and(token ~ '^[0-9a-f]{64}$') AS hex
FROM public.create_review_invites('guest_checkouts', :'gc') \gset
SELECT pg_temp.ok(:n = 2, 'гость: по ссылке на товар, повтор строки заказа ссылку не дублирует');
SELECT pg_temp.ok(:'names' = :'prod_a_name' || '|' || :'prod_b_name', 'ссылки по алфавиту названий');
SELECT pg_temp.ok(:'hex'::boolean, 'токен — 64 шестнадцатеричных знака');

SELECT max(token) FILTER (WHERE product_id = :'prod_a') AS tok_ga,
       max(token) FILTER (WHERE product_id = :'prod_b') AS tok_gb
FROM public.create_review_invites('guest_checkouts', :'gc') \gset
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.review_invites WHERE guest_checkout_id = :'gc') = 2
  AND (SELECT token FROM public.create_review_invites('guest_checkouts', :'gc') WHERE product_id = :'prod_a') = :'tok_ga',
  'повторный вызов (ретрай вебхука) отдаёт те же ссылки');
SELECT pg_temp.ok(
  (SELECT expires_at - created_at FROM public.review_invites WHERE token = :'tok_ga') = interval '60 days',
  'ссылка живёт 60 дней');

SELECT pg_temp.ok(
  (SELECT count(*) FROM public.create_review_invites('guest_checkouts', :'gc_open')) = 0
  AND NOT EXISTS (SELECT 1 FROM public.review_invites WHERE guest_checkout_id = :'gc_open'),
  'недоставленный заказ — ссылок нет');

SELECT count(*) AS n_ord, max(token) AS tok_oa, max(product_id::text) AS ord_prod
FROM public.create_review_invites('orders', :'ord') \gset
SELECT pg_temp.ok(:n_ord = 1 AND :'ord_prod' = :'prod_a', 'аккаунт: товар, на который отзыв уже есть, в письмо не идёт');
SELECT token AS tok_ob FROM public.review_invites WHERE order_id = :'ord' AND product_id = :'prod_b' \gset

SELECT max(token) AS tok_nn FROM public.create_review_invites('guest_checkouts', :'gc_noname') \gset

SELECT pg_temp.ok(
  pg_temp.err(format('select * from public.create_review_invites(%L, %L)', 'products', :'ord')) LIKE '%неизвестная таблица%',
  'неизвестная таблица — ошибка');

-- ── Права ───────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(
  NOT has_function_privilege('anon', 'public.create_review_invites(text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.create_review_invites(text,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.create_review_invites(text,uuid)', 'EXECUTE'),
  'выпуск ссылок — только service_role');
SELECT pg_temp.ok(
  has_function_privilege('anon', 'public.get_review_invite(text)', 'EXECUTE')
  AND has_function_privilege('anon', 'public.submit_review_by_invite(text,integer,text,text)', 'EXECUTE'),
  'страница по ссылке работает без входа (anon)');
SELECT pg_temp.ok(
  NOT has_table_privilege('anon', 'public.review_invites', 'SELECT,INSERT,UPDATE,DELETE')
  AND NOT has_table_privilege('authenticated', 'public.review_invites', 'SELECT,INSERT,UPDATE,DELETE'),
  'таблица ссылок закрыта для anon и authenticated');
SELECT pg_temp.ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.review_invites'::regclass),
  'на таблице ссылок включён RLS');

-- ── Гость оставляет отзыв (под anon — как страница) ─────────────────────────
SET ROLE anon;
SELECT status AS st, is_guest AS guest, author_name AS nm, product_name AS pn
FROM public.get_review_invite(:'tok_ga') \gset
SELECT public.submit_review_by_invite(:'tok_ga', 5, '  Отличная игрушка  ', '  Айгерим Н.  ') AS rev_guest \gset
RESET ROLE;
SELECT pg_temp.ok(:'st' = 'ok' AND :'guest'::boolean AND :'nm' = 'Айгерим' AND :'pn' = :'prod_a_name',
  'гость открывает ссылку: товар и имя из заказа — только имя, без фамилии');
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.product_reviews
  WHERE id = :'rev_guest' AND user_id IS NULL AND guest_checkout_id = :'gc' AND order_id IS NULL
    AND rating = 5 AND text = 'Отличная игрушка' AND author_name = 'Айгерим Н.' AND is_published = false),
  'отзыв гостя: без аккаунта, на модерации, текст и имя без лишних пробелов');
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.review_invites WHERE token = :'tok_ga' AND used_at IS NOT NULL AND review_id = :'rev_guest'),
  'ссылка помечена использованной и связана с отзывом');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.submit_review_by_invite(%L, 4, %L, null)', :'tok_ga', 'ещё раз')) LIKE '%review_invite_used%',
  'второй отзыв по той же ссылке — отказ');
SELECT pg_temp.ok((SELECT status FROM public.get_review_invite(:'tok_ga')) = 'used', 'страница видит использованную ссылку');

UPDATE public.review_invites SET expires_at = now() - interval '1 second' WHERE token = :'tok_gb';
SELECT pg_temp.ok((SELECT status FROM public.get_review_invite(:'tok_gb')) = 'expired', 'просроченная ссылка — expired');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.submit_review_by_invite(%L, 5, null, null)', :'tok_gb')) LIKE '%review_invite_expired%',
  'по просроченной ссылке отзыв не принимается');

SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.get_review_invite('нет-такой-ссылки') WHERE status = 'not_found' AND product_id IS NULL),
  'неизвестная ссылка — not_found');
SELECT pg_temp.ok(
  pg_temp.err('select public.submit_review_by_invite(''нет-такой-ссылки'', 5, null, null)') LIKE '%review_invite_not_found%',
  'по неизвестной ссылке отзыв не принимается');

-- Гость без имени и стёр подставленное — на сайте «Покупатель».
SELECT public.submit_review_by_invite(:'tok_nn', 3, null, '   ') AS rev_noname \gset
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.product_reviews WHERE id = :'rev_noname' AND author_name IS NULL AND text IS NULL),
  'пустые имя и текст — NULL, а не пустые строки');

-- ── Покупатель с аккаунтом ──────────────────────────────────────────────────
SELECT pg_temp.ok(
  pg_temp.err(format('select public.submit_review_by_invite(%L, 0, null, null)', :'tok_oa')) LIKE '%review_invite_bad_rating%',
  'оценка 0 — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.submit_review_by_invite(%L, 6, null, null)', :'tok_oa')) LIKE '%review_invite_bad_rating%',
  'оценка 6 — отказ');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.submit_review_by_invite(%L, 5, %L, null)', :'tok_oa', repeat('а', 2001))) LIKE '%review_invite_text_too_long%',
  'текст длиннее 2000 знаков — отказ');
SELECT pg_temp.ok((SELECT status FROM public.get_review_invite(:'tok_oa')) = 'ok', 'отказ по вводу ссылку не тратит');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.get_review_invite(:'tok_oa') WHERE status = 'ok' AND NOT is_guest AND author_name = 'Малик'),
  'аккаунт: не гость, имя из профиля');

SET ROLE anon;
SELECT public.submit_review_by_invite(:'tok_oa', 4, 'Хорошо', 'Чужое имя') AS rev_user \gset
RESET ROLE;
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.product_reviews
  WHERE id = :'rev_user' AND user_id = :'uid' AND order_id = :'ord' AND guest_checkout_id IS NULL
    AND author_name IS NULL AND is_published = false),
  'отзыв по ссылке ложится на профиль покупателя, имя с формы не берётся');
SELECT pg_temp.ok((SELECT status FROM public.get_review_invite(:'tok_ob')) = 'already_reviewed', 'на товар с отзывом — already_reviewed');
SELECT pg_temp.ok(
  pg_temp.err(format('select public.submit_review_by_invite(%L, 5, null, null)', :'tok_ob')) LIKE '%review_invite_already_reviewed%',
  'второй отзыв покупателя на товар — отказ');

-- ── Модерация и бонусы ──────────────────────────────────────────────────────
SELECT count(*) AS bonus_before FROM public.bonus_transactions \gset
SELECT coalesce(active_bonus_balance, 0) AS bal_before FROM public.profiles WHERE id = :'uid' \gset
UPDATE public.product_reviews SET is_published = true WHERE id IN (:'rev_guest', :'rev_noname');
SELECT pg_temp.ok((SELECT count(*) FROM public.bonus_transactions) = :bonus_before,
  'публикация отзыва гостя — бонус не начисляется: начислять некому');
UPDATE public.product_reviews SET is_published = true WHERE id = :'rev_user';
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.bonus_transactions
  WHERE profile_id = :'uid' AND transaction_type = 'review' AND amount = 500 AND description LIKE '%' || :'rev_user' || '%'),
  'публикация отзыва покупателя с аккаунтом — 500 бонусов, как раньше');
SELECT pg_temp.ok((SELECT active_bonus_balance FROM public.profiles WHERE id = :'uid') = :bal_before + 500,
  'баланс покупателя вырос на 500');

-- ── Вывод ───────────────────────────────────────────────────────────────────
SELECT pg_temp.ok(EXISTS (
  SELECT 1 FROM public.get_product_reviews(:'prod_a')
  WHERE id = :'rev_guest' AND profiles->>'first_name' = 'Айгерим Н.' AND profiles->'last_name' = 'null'::jsonb AND NOT is_mine),
  'карточка товара: у отзыва гостя имя с формы');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.get_product_reviews(:'prod_a') WHERE id = :'rev_user' AND profiles->>'first_name' = 'Малик'),
  'карточка товара: у отзыва с аккаунтом имя из профиля, как раньше');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.get_product_reviews(:'prod_b') WHERE id = :'rev_noname' AND profiles IS NULL),
  'карточка товара: гость без имени — без автора (сайт напишет «Покупатель»)');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.get_latest_category_reviews(:'cat_a', 10) WHERE review_id = :'rev_guest' AND user_name = 'Айгерим Н.'),
  'отзывы раздела: имя гостя');
SELECT pg_temp.ok(EXISTS (SELECT 1 FROM public.get_reviews_by_brand(:'brand_id', 10, 0) WHERE id = :'rev_guest' AND user_name = 'Айгерим Н.'),
  'отзывы бренда: имя гостя');
SELECT pg_temp.ok(
  (SELECT review_count FROM public.products WHERE id = :'prod_a') = 2
  AND (SELECT avg_rating FROM public.products WHERE id = :'prod_a') = 4.5,
  'счётчик и средняя оценка товара учитывают отзыв гостя');

SET ROLE anon;
SELECT count(*) AS anon_sees FROM public.product_reviews WHERE id = :'rev_guest' \gset
RESET ROLE;
SELECT pg_temp.ok(:anon_sees = 1, 'опубликованный отзыв гостя виден всем — политика чтения та же');

-- ── Уникальность ────────────────────────────────────────────────────────────
SELECT pg_temp.ok(
  pg_temp.err(format('insert into public.product_reviews (user_id, product_id, guest_checkout_id, rating) values (null, %L, %L, 3)', :'prod_a', :'gc'))
    LIKE '%product_reviews_guest_checkout_product_key%',
  'гость: второй отзыв на товар того же заказа не ляжет');
SELECT pg_temp.ok(
  pg_temp.err(format('insert into public.product_reviews (user_id, product_id, rating) values (%L, %L, 3)', :'uid', :'prod_a'))
    LIKE '%product_reviews_user_id_product_id_key%',
  'аккаунт: один отзыв на товар, как раньше');

ROLLBACK;
\echo 'Все проверки пройдены, транзакция откатана.'
