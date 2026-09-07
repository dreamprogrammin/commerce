-- =====================================================================================
-- ОТЗЫВЫ: не отдавать анониму внутренний user_id
-- =====================================================================================
-- НАЙДЕНО аудитом 7 сентября 2026.
--
-- `product_reviews` отдаёт анониму `user_id` — это `auth.users.id`, ключ, по
-- которому раньше выписывался magic-link входа (тот вектор закрыт отдельной
-- миграцией). Утечка шла двумя путями: политика «Anyone can read published
-- reviews» позволяла `SELECT *` анониму, и функция `get_product_reviews`
-- возвращала колонку `user_id` всем.
--
-- КАК ДЕЛАЮТ КРУПНЫЕ МАГАЗИНЫ. Наружу отдают имя автора, оценку, текст, дату —
-- и признак «это мой отзыв», чтобы показать кнопку удаления. Внутренний id
-- аккаунта в публичном API не светят. Здесь так же: функция вместо `user_id`
-- возвращает `is_mine` (совпал ли автор с текущим пользователем), а прямое
-- чтение колонки `user_id` анониму закрыто на уровне привилегий.
-- =====================================================================================

-- 1. Колонку user_id анониму читать нельзя. Публичный список идёт через
--    функцию ниже; прямого чтения таблицы у анонима в приложении нет.
REVOKE SELECT ON public.product_reviews FROM anon;
GRANT SELECT (
  id, product_id, order_id, rating, text, is_published, created_at, updated_at
) ON public.product_reviews TO anon;

-- 2. Функция публичного списка: вместо user_id — is_mine.
DROP FUNCTION IF EXISTS public.get_product_reviews(uuid);

CREATE FUNCTION public.get_product_reviews(p_product_id uuid)
RETURNS TABLE(
  id uuid,
  product_id uuid,
  is_mine boolean,
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

COMMENT ON FUNCTION public.get_product_reviews(uuid) IS
'Публичный список отзывов товара. Отдаёт имя автора и признак is_mine, но НЕ
внутренний user_id аккаунта.';

GRANT EXECUTE ON FUNCTION public.get_product_reviews(uuid) TO anon, authenticated;

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.product_reviews', 'user_id', 'SELECT') THEN
    RAISE EXCEPTION 'anon всё ещё читает product_reviews.user_id';
  END IF;

  IF NOT has_column_privilege('anon', 'public.product_reviews', 'rating', 'SELECT') THEN
    RAISE EXCEPTION 'anon потерял доступ к оценке — сломается что-то ещё';
  END IF;

  RAISE NOTICE '✅ user_id больше не отдаётся анониму, публичный список — через is_mine';
END $$;

NOTIFY pgrst, 'reload schema';
