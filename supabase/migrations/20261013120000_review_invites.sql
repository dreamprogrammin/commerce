-- ============================================================================
-- Отзыв без входа — по одноразовой ссылке из письма «Заказ доставлен».
--
-- Зачем. Звёзд в выдаче у 226 страниц нет: настоящих отзывов почти нет.
-- Оставить отзыв можно было только войдя в аккаунт — на карточке товара или
-- в заказе в кабинете; гость не мог вовсе. Письма «доставлен» не было (решение
-- владельца 29 сентября) — теперь оно уходит ради ссылок на отзыв. На 13 октября
-- доставленных заказов 16: 14 с аккаунтом и 2 гостевых — ссылка нужна всем.
--
-- Что делается:
--   1. `product_reviews` принимает отзыв гостя: `user_id` может быть NULL, у
--      такого отзыва — имя из заказа (`author_name`) и ссылка на гостевой заказ.
--   2. `review_invites` — по приглашению на каждый купленный товар заказа;
--      ссылка живёт 60 дней (решение владельца 13 октября 2026), одноразовая.
--   3. Функции: выпустить приглашения (только service_role — её зовёт
--      эдж-функция письма), показать приглашение и отправить отзыв по нему
--      (anon и authenticated — страница /review/<токен>).
--   4. Вывод отзывов (карточка, раздел, бренд) — имя гостя вместо «Покупатель».
--   5. Бонус за отзыв — только у отзыва с пользователем (у гостя нет профиля).
--
-- Тела функций 4–5 сняты с прода 13 октября 2026 (`pg_get_functiondef`) и
-- изменены точечно; перед заменой — сверка md5, при расхождении миграция
-- падает, ничего не тронув. Сигнатуры и типы возврата прежние — замена
-- `CREATE OR REPLACE`, новых перегрузок нет.
--
-- Токен хранится в таблице как есть, как и в `magic_links`: функция выпуска
-- обязана быть идемпотентной (повтор вебхука вызывает её снова, а письмо с
-- `Idempotency-Key` второй раз не уходит — новые токены сломали бы ссылку из
-- уже отправленного письма). Таблица закрыта RLS без единой политики, читать
-- её могут только функции ниже и service_role.
-- ============================================================================

-- ── 0. Состояние базы — то, под которое всё готовилось ──────────────────────
DO $$
DECLARE
  v_md5 text;
BEGIN
  IF to_regclass('public.review_invites') IS NOT NULL THEN
    RAISE EXCEPTION 'review_invites уже существует — миграция применялась?';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'product_reviews'
      AND column_name = 'user_id' AND is_nullable = 'NO'
  ) THEN
    RAISE EXCEPTION 'product_reviews.user_id не NOT NULL — база не та, под которую готовилась миграция';
  END IF;

  SELECT md5(pg_get_functiondef('public.get_product_reviews(uuid)'::regprocedure)) INTO v_md5;
  IF v_md5 <> '1c9912d2c0413c9c1a38080adb86eb0c' THEN
    RAISE EXCEPTION 'get_product_reviews: тело не то (md5 %), снято с прода 13.10.2026', v_md5;
  END IF;

  SELECT md5(pg_get_functiondef('public.get_latest_category_reviews(uuid,integer)'::regprocedure)) INTO v_md5;
  IF v_md5 <> '67ef3f0bc9c49641fd51b44282174e15' THEN
    RAISE EXCEPTION 'get_latest_category_reviews: тело не то (md5 %), снято с прода 13.10.2026', v_md5;
  END IF;

  SELECT md5(pg_get_functiondef('public.get_reviews_by_brand(uuid,integer,integer)'::regprocedure)) INTO v_md5;
  IF v_md5 <> '1c0d9fd33c9d67a6774656d131ef0ed2' THEN
    RAISE EXCEPTION 'get_reviews_by_brand: тело не то (md5 %), снято с прода 13.10.2026', v_md5;
  END IF;

  SELECT md5(pg_get_functiondef('public.award_bonus_for_review()'::regprocedure)) INTO v_md5;
  IF v_md5 <> '8b2f2f2adcaefb7300ab3e7bd26884cf' THEN
    RAISE EXCEPTION 'award_bonus_for_review: тело не то (md5 %), снято с прода 13.10.2026', v_md5;
  END IF;
END $$;

-- ── 1. Отзыв гостя ──────────────────────────────────────────────────────────
-- UNIQUE (user_id, product_id) остаётся: у вошедшего — один отзыв на товар.
-- NULL в уникальном ключе различны, поэтому у гостей своя уникальность —
-- один отзыв на товар гостевого заказа.
ALTER TABLE public.product_reviews ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.product_reviews ADD COLUMN author_name text;
ALTER TABLE public.product_reviews
  ADD COLUMN guest_checkout_id uuid REFERENCES public.guest_checkouts(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX product_reviews_guest_checkout_product_key
  ON public.product_reviews (guest_checkout_id, product_id)
  WHERE guest_checkout_id IS NOT NULL;

COMMENT ON COLUMN public.product_reviews.author_name IS
  'Имя автора отзыва без профиля (гость, по ссылке из письма). У отзыва с user_id — NULL: имя берётся из профиля.';

-- ── 2. Приглашения ──────────────────────────────────────────────────────────
CREATE TABLE public.review_invites (
  token text PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  guest_checkout_id uuid REFERENCES public.guest_checkouts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '60 days',
  used_at timestamptz,
  review_id uuid REFERENCES public.product_reviews(id) ON DELETE SET NULL,
  CONSTRAINT review_invites_one_source CHECK ((order_id IS NULL) <> (guest_checkout_id IS NULL))
);
CREATE UNIQUE INDEX review_invites_order_product
  ON public.review_invites (order_id, product_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX review_invites_guest_product
  ON public.review_invites (guest_checkout_id, product_id) WHERE guest_checkout_id IS NOT NULL;

ALTER TABLE public.review_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.review_invites FROM anon, authenticated;

COMMENT ON TABLE public.review_invites IS
  'Одноразовые ссылки на отзыв из письма «Заказ доставлен». Политик нет: доступ только через create_review_invites / get_review_invite / submit_review_by_invite и service_role.';

-- ── 3. Выпуск приглашений — для эдж-функции письма ──────────────────────────
-- Идемпотентна: повторный вызов возвращает те же токены. Только доставленные
-- заказы; товары, на которые пользователь уже написал отзыв, пропускаются.
-- Название — чтобы письму не ходить за ним вторым запросом; порядок по нему.
CREATE FUNCTION public.create_review_invites(p_table text, p_order_id uuid)
RETURNS TABLE(product_id uuid, product_name text, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id uuid;
  v_status text;
  v_name text;
BEGIN
  IF p_table = 'orders' THEN
    SELECT o.user_id, o.status INTO v_user_id, v_status
    FROM orders o WHERE o.id = p_order_id;
    IF NOT FOUND OR v_status NOT IN ('delivered', 'completed') THEN
      RETURN;
    END IF;
    SELECT NULLIF(TRIM(pr.first_name), '') INTO v_name FROM profiles pr WHERE pr.id = v_user_id;

    INSERT INTO review_invites (token, product_id, order_id, user_id, author_name)
    SELECT DISTINCT ON (oi.product_id)
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      oi.product_id, p_order_id, v_user_id, v_name
    FROM order_items oi
    WHERE oi.order_id = p_order_id AND oi.product_id IS NOT NULL
    ON CONFLICT (order_id, product_id) WHERE order_id IS NOT NULL DO NOTHING;

    RETURN QUERY
    SELECT ri.product_id, p.name, ri.token
    FROM review_invites ri
    JOIN products p ON p.id = ri.product_id
    WHERE ri.order_id = p_order_id
      AND ri.used_at IS NULL
      AND ri.expires_at > now()
      AND NOT EXISTS (
        SELECT 1 FROM product_reviews r
        WHERE r.user_id = v_user_id AND r.product_id = ri.product_id
      )
    ORDER BY p.name, ri.product_id;

  ELSIF p_table = 'guest_checkouts' THEN
    -- Имя на сайте — только первое слово из заказа: фамилию гостя публиковать незачем.
    SELECT g.status, NULLIF(split_part(TRIM(g.guest_name), ' ', 1), '')
    INTO v_status, v_name
    FROM guest_checkouts g WHERE g.id = p_order_id;
    IF NOT FOUND OR v_status NOT IN ('delivered', 'completed') THEN
      RETURN;
    END IF;

    INSERT INTO review_invites (token, product_id, guest_checkout_id, author_name)
    SELECT DISTINCT ON (gi.product_id)
      replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
      gi.product_id, p_order_id, v_name
    FROM guest_checkout_items gi
    WHERE gi.checkout_id = p_order_id AND gi.product_id IS NOT NULL
    ON CONFLICT (guest_checkout_id, product_id) WHERE guest_checkout_id IS NOT NULL DO NOTHING;

    RETURN QUERY
    SELECT ri.product_id, p.name, ri.token
    FROM review_invites ri
    JOIN products p ON p.id = ri.product_id
    WHERE ri.guest_checkout_id = p_order_id
      AND ri.used_at IS NULL
      AND ri.expires_at > now()
    ORDER BY p.name, ri.product_id;
  ELSE
    RAISE EXCEPTION 'create_review_invites: неизвестная таблица %', p_table;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_review_invites(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_review_invites(text, uuid) TO service_role;

-- ── 4. Приглашение по токену — для страницы /review/<токен> ─────────────────
-- status: ok | used | expired | not_found | already_reviewed.
-- is_guest — заказ без аккаунта: у такого отзыва имя вводится на странице, у
-- зарегистрированного оно берётся из профиля.
CREATE FUNCTION public.get_review_invite(p_token text)
RETURNS TABLE(status text, product_id uuid, product_name text, product_slug text, image_url text, author_name text, is_guest boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_invite review_invites%ROWTYPE;
  v_status text := 'ok';
BEGIN
  SELECT * INTO v_invite FROM review_invites ri WHERE ri.token = p_token;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  IF v_invite.used_at IS NOT NULL THEN
    v_status := 'used';
  ELSIF v_invite.expires_at <= now() THEN
    v_status := 'expired';
  ELSIF v_invite.user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM product_reviews r WHERE r.user_id = v_invite.user_id AND r.product_id = v_invite.product_id
  ) THEN
    v_status := 'already_reviewed';
  END IF;

  RETURN QUERY
  SELECT
    v_status,
    p.id,
    p.name,
    p.slug,
    (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id
      ORDER BY pi.display_order NULLS LAST, pi.id LIMIT 1),
    v_invite.author_name,
    v_invite.user_id IS NULL
  FROM products p
  WHERE p.id = v_invite.product_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_review_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_review_invite(text) TO anon, authenticated, service_role;

-- ── 5. Отзыв по приглашению ─────────────────────────────────────────────────
-- Отзыв уходит на модерацию (is_published = false), как и написанный на сайте.
-- Ошибки — RAISE с кодом в тексте: страница показывает по нему сообщение.
CREATE FUNCTION public.submit_review_by_invite(p_token text, p_rating integer, p_text text, p_author_name text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_invite review_invites%ROWTYPE;
  v_text text := NULLIF(TRIM(p_text), '');
  v_name text := NULLIF(TRIM(p_author_name), '');
  v_review_id uuid;
BEGIN
  SELECT * INTO v_invite FROM review_invites ri WHERE ri.token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_invite_not_found';
  END IF;
  IF v_invite.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'review_invite_used';
  END IF;
  IF v_invite.expires_at <= now() THEN
    RAISE EXCEPTION 'review_invite_expired';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'review_invite_bad_rating';
  END IF;
  IF v_text IS NOT NULL AND length(v_text) > 2000 THEN
    RAISE EXCEPTION 'review_invite_text_too_long';
  END IF;
  IF v_name IS NOT NULL AND length(v_name) > 40 THEN
    v_name := left(v_name, 40);
  END IF;

  IF v_invite.user_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM product_reviews r WHERE r.user_id = v_invite.user_id AND r.product_id = v_invite.product_id) THEN
      RAISE EXCEPTION 'review_invite_already_reviewed';
    END IF;
    INSERT INTO product_reviews (user_id, product_id, order_id, rating, text, is_published)
    VALUES (v_invite.user_id, v_invite.product_id, v_invite.order_id, p_rating, v_text, false)
    RETURNING id INTO v_review_id;
  ELSE
    INSERT INTO product_reviews (user_id, product_id, order_id, guest_checkout_id, rating, text, author_name, is_published)
    VALUES (NULL, v_invite.product_id, v_invite.order_id, v_invite.guest_checkout_id, p_rating, v_text, v_name, false)
    RETURNING id INTO v_review_id;
  END IF;

  UPDATE review_invites SET used_at = now(), review_id = v_review_id WHERE token = p_token;
  RETURN v_review_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_review_by_invite(text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_review_by_invite(text, integer, text, text) TO anon, authenticated, service_role;

-- ── 6. Вывод отзывов: имя гостя вместо «Покупатель» ─────────────────────────
-- Тела — с прода (см. md5 в начале); изменено только выражение автора.
CREATE OR REPLACE FUNCTION public.get_product_reviews(p_product_id uuid)
 RETURNS TABLE(id uuid, product_id uuid, is_mine boolean, order_id uuid, rating smallint, text text, is_published boolean, created_at timestamp with time zone, updated_at timestamp with time zone, profiles jsonb, review_images jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    r.id,
    r.product_id,
    -- «Мой ли это отзыв» — вместо голого account id. Для анонима всегда false.
    (auth.uid() IS NOT NULL AND auth.uid() = r.user_id) AS is_mine,
    r.order_id,
    r.rating,
    r.text,
    r.is_published,
    r.created_at,
    r.updated_at,
    CASE
      WHEN pr.id IS NOT NULL THEN jsonb_build_object(
        'first_name', pr.first_name,
        'last_name', pr.last_name,
        'avatar_url', pr.avatar_url
      )
      -- Отзыв гостя по ссылке из письма: профиля нет, имя — из заказа.
      WHEN NULLIF(TRIM(r.author_name), '') IS NOT NULL THEN jsonb_build_object(
        'first_name', TRIM(r.author_name),
        'last_name', NULL,
        'avatar_url', NULL
      )
      ELSE NULL
    END AS profiles,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ri.id,
            'image_url', ri.image_url,
            'blur_placeholder', ri.blur_placeholder,
            'display_order', ri.display_order
          )
          ORDER BY ri.display_order NULLS LAST, ri.id
        )
        FROM review_images ri
        WHERE ri.review_id = r.id
      ),
      '[]'::jsonb
    ) AS review_images
  FROM product_reviews r
  LEFT JOIN profiles pr ON pr.id = r.user_id
  WHERE r.product_id = p_product_id
    AND r.is_published = TRUE
  ORDER BY r.created_at DESC;
$function$;

CREATE OR REPLACE FUNCTION public.get_latest_category_reviews(p_category_id uuid, p_limit integer DEFAULT 5)
 RETURNS TABLE(review_id uuid, rating integer, text text, created_at timestamp with time zone, user_name text, product_name text, product_slug text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    r.id AS review_id,
    r.rating::INTEGER,
    r.text,
    r.created_at,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', prof.first_name, prof.last_name)), ''),
      NULLIF(TRIM(r.author_name), ''),
      'Покупатель'
    ) AS user_name,
    p.name AS product_name,
    p.slug AS product_slug
  FROM product_reviews r
  JOIN products p ON p.id = r.product_id
  LEFT JOIN profiles prof ON prof.id = r.user_id
  WHERE r.is_published = TRUE
    AND p.category_id IN (
      SELECT id FROM get_category_and_children_ids_by_uuid(p_category_id)
    )
  ORDER BY r.created_at DESC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_reviews_by_brand(p_brand_id uuid, p_limit integer DEFAULT 10, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, rating smallint, comment text, created_at timestamp with time zone, product_id uuid, product_name text, product_slug text, user_name text, user_avatar_url text, images jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    r.id,
    r.rating,
    r.text AS comment,
    r.created_at,
    p.id AS product_id,
    p.name AS product_name,
    p.slug AS product_slug,
    COALESCE(
      NULLIF(TRIM(CONCAT_WS(' ', pr.first_name, pr.last_name)), ''),
      NULLIF(TRIM(r.author_name), ''),
      'Покупатель'
    ) AS user_name,
    pr.avatar_url AS user_avatar_url,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ri.id,
            'image_url', ri.image_url,
            'blur_placeholder', ri.blur_placeholder,
            'display_order', ri.display_order
          )
          ORDER BY ri.display_order
        )
        FROM review_images ri
        WHERE ri.review_id = r.id
      ),
      '[]'::jsonb
    ) AS images
  FROM product_reviews r
  JOIN products p ON p.id = r.product_id
  LEFT JOIN profiles pr ON pr.id = r.user_id
  WHERE p.brand_id = p_brand_id
    AND r.is_published = true
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$function$;

-- ── 7. Бонус за отзыв — только отзыву с пользователем ───────────────────────
-- Тело — с прода; добавлен ранний выход для отзыва без пользователя. Без него
-- вставка в bonus_transactions с NULL падала бы и глушилась EXCEPTION ниже —
-- публикация прошла бы, но с предупреждением в журнале на каждый гостевой отзыв.
CREATE OR REPLACE FUNCTION public.award_bonus_for_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_profile RECORD;
  v_new_active INTEGER;
BEGIN
  -- Отзыв гостя по ссылке из письма: профиля нет — начислять некому.
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_published = true AND (OLD.is_published = false OR OLD.is_published IS NULL) THEN
    -- Проверяем, не давали ли уже бонус за этот отзыв
    IF EXISTS (
      SELECT 1 FROM public.bonus_transactions
      WHERE profile_id = NEW.user_id
        AND transaction_type = 'review'
        AND description LIKE '%' || NEW.id::text || '%'
    ) THEN
      RETURN NEW;
    END IF;

    -- Получаем текущие балансы
    SELECT active_bonus_balance, pending_bonus_balance
    INTO v_user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;

    v_new_active := COALESCE(v_user_profile.active_bonus_balance, 0) + 500;

    -- Начисляем бонусы СРАЗУ в active (не в pending)
    INSERT INTO public.bonus_transactions (
      profile_id, user_id, transaction_type, amount,
      balance_after, pending_balance_after,
      description, status, activation_date, created_at
    ) VALUES (
      NEW.user_id, NEW.user_id, 'review', 500,
      v_new_active,
      COALESCE(v_user_profile.pending_bonus_balance, 0),
      'Бонусы за отзыв (review: ' || NEW.id || ')',
      'completed',
      now(),
      now()
    );

    -- Обновляем active_bonus_balance (не pending!)
    UPDATE public.profiles
    SET active_bonus_balance = v_new_active
    WHERE id = NEW.user_id;

    -- Уведомление
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      NEW.user_id, 'bonus_earned',
      '🎁 Вам начислено 500 бонусов!',
      'Спасибо за отзыв! Бонусы уже доступны для использования.',
      '/profile/bonuses',
      false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'award_bonus_for_review error: %', SQLERRM;
  RETURN NEW;
END;
$function$;

-- ── 8. Проверка: по одной версии каждой функции ─────────────────────────────
DO $$
DECLARE
  v_name text;
  v_count integer;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'create_review_invites', 'get_review_invite', 'submit_review_by_invite',
    'get_product_reviews', 'get_latest_category_reviews', 'get_reviews_by_brand',
    'award_bonus_for_review'
  ] LOOP
    SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;
    IF v_count <> 1 THEN
      RAISE EXCEPTION 'функция % — версий %, ожидалась одна', v_name, v_count;
    END IF;
  END LOOP;
END $$;
