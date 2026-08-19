-- Имя автора отзыва анонимному посетителю.
--
-- У таблицы profiles нет ни одной политики чтения для анонимов: только
-- «Users can view own profile» (auth.uid() = id) и «Admins can view all
-- profiles». Поэтому LEFT JOIN profiles у гостя не находит ничего, и под
-- каждым отзывом стоит запасное «Покупатель» — при том, что имена заполнены
-- (на проде 9 профилей из 9 имеют first_name/last_name).
--
-- Ломается это в двух местах сразу:
--   1. блок отзывов категории — get_latest_category_reviews, SECURITY INVOKER;
--   2. карточка товара — stores/publicStore/reviewsStore.ts тянет
--      product_reviews с вложенным profiles!product_reviews_profile_id_fkey
--      напрямую анонимным клиентом.
--
-- Почему не политика RLS. В profiles лежат phone, telegram_chat_id,
-- active_bonus_balance, pending_bonus_balance, role. Политика открывает
-- СТРОКУ целиком, то есть вместе с телефоном и балансом. Ограничить состав
-- колонок можно только отзывом табличного GRANT у роли anon, а он выдан
-- на всю таблицу по умолчанию — переделывать его ради имени рискованнее,
-- чем не открывать таблицу вовсе.
--
-- Поэтому SECURITY DEFINER: имя отдаёт функция, а profiles остаётся закрытой
-- полностью. В репозитории это уже принятое решение — get_reviews_by_brand
-- (20260313000001) отдаёт имена на страницах брендов ровно так же. То есть
-- «имя автора публично» здесь не новое решение, а выравнивание: на брендах
-- имена показывались, на категориях и в карточке — нет.
--
-- У всех трёх функций явно фиксируется search_path. Для SECURITY DEFINER это
-- обязательно: без него вызывающий может подсунуть свою схему первой и
-- подменить product_reviews или profiles собственными таблицами, а тело
-- выполнится с правами владельца.

-- ---------------------------------------------------------------------------
-- Проверка состояния. Падаем, если база не та, под которую готовилась правка.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.get_latest_category_reviews(uuid, integer)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции get_latest_category_reviews(uuid, integer) — сигнатура разошлась';
  END IF;

  IF to_regprocedure('public.get_reviews_by_brand(uuid, integer, integer)') IS NULL THEN
    RAISE EXCEPTION 'Нет функции get_reviews_by_brand(uuid, integer, integer) — сигнатура разошлась';
  END IF;

  IF to_regclass('public.review_images') IS NULL THEN
    RAISE EXCEPTION 'Нет таблицы public.review_images';
  END IF;

  -- Ради этого всё и делается: функция должна выполняться от владельца, а
  -- владелец — обходить RLS у profiles. Если это не так, DEFINER не поможет
  -- и имена останутся пустыми: лучше упасть здесь, чем выкатить пустышку.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_roles r ON r.oid = c.relowner
    WHERE c.oid = 'public.profiles'::regclass
      AND NOT c.relforcerowsecurity
      AND (r.rolbypassrls OR r.rolsuper)
  ) THEN
    RAISE EXCEPTION 'Владелец public.profiles не обходит RLS — SECURITY DEFINER не даст доступа к именам';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. Отзывы в блоке категории.
--
-- Тело не меняется, меняется только режим выполнения. Фильтр
-- is_published = TRUE внутри функции остаётся и теперь становится
-- единственной защитой от попадания немодерированных отзывов в публичный
-- листинг — до этого его дублировала RLS-политика «Anyone can read published
-- reviews», которая при DEFINER больше не применяется.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.get_latest_category_reviews(uuid, integer)
  SECURITY DEFINER
  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- 2. Отзывы на карточке товара.
--
-- Раньше карточка читала product_reviews напрямую вместе с вложенным
-- profiles. Вложение анонимному клиенту недоступно, поэтому чтение переезжает
-- в функцию — тот же приём, что уже применён к брендам.
--
-- Состав полей повторяет прежний запрос из reviewsStore (REVIEW_SELECT),
-- чтобы компоненты не переписывать: profiles и review_images отдаются как
-- jsonb и в JSON-ответе выглядят ровно так же, как выглядели вложения
-- PostgREST.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_product_reviews(p_product_id uuid)
RETURNS TABLE (
  id uuid,
  product_id uuid,
  user_id uuid,
  order_id uuid,
  rating smallint,
  text text,
  is_published boolean,
  created_at timestamptz,
  updated_at timestamptz,
  profiles jsonb,
  review_images jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT
    r.id,
    r.product_id,
    r.user_id,
    r.order_id,
    r.rating,
    r.text,
    r.is_published,
    r.created_at,
    r.updated_at,
    -- NULL, а не объект из одних null: в ProductReview поле объявлено
    -- как `profiles: {...} | null`, и ReviewCard проверяет именно на null
    CASE
      WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object(
        'first_name', pr.first_name,
        'last_name', pr.last_name,
        'avatar_url', pr.avatar_url
      )
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

REVOKE ALL ON FUNCTION public.get_product_reviews(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_product_reviews(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_product_reviews(uuid) IS
  'Опубликованные отзывы товара вместе с именем автора. SECURITY DEFINER: profiles закрыта для анонимов, имя отдаёт функция.';

-- ---------------------------------------------------------------------------
-- 3. Заодно закрываем search_path у бренд-функции.
--
-- get_reviews_by_brand объявлена SECURITY DEFINER ещё в марте, но без
-- фиксированного search_path — та самая дыра, которую описано выше и которую
-- две другие функции здесь закрывают. Оставлять рядом две запертые и одну
-- открытую бессмысленно. Тело не трогаем.
-- ---------------------------------------------------------------------------
ALTER FUNCTION public.get_reviews_by_brand(uuid, integer, integer)
  SET search_path = public, pg_temp;

-- ---------------------------------------------------------------------------
-- Контроль: три функции, все DEFINER, у всех зафиксирован search_path.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad TEXT;
BEGIN
  SELECT string_agg(p.proname || ' (definer=' || p.prosecdef || ', config=' ||
                    COALESCE(array_to_string(p.proconfig, ','), 'нет') || ')', '; ')
  INTO bad
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_latest_category_reviews', 'get_product_reviews', 'get_reviews_by_brand')
    AND (
      NOT p.prosecdef
      OR p.proconfig IS NULL
      OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
    );

  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'Функции остались без SECURITY DEFINER или без search_path: %', bad;
  END IF;
END $$;
