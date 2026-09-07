-- =====================================================================================
-- ВОПРОСЫ О ТОВАРЕ: не отдавать анониму user_id, показывать имя автора
-- =====================================================================================
-- Тот же хвост, что у отзывов. `product_questions` читается фронтом ПРЯМЫМ
-- запросом с колонкой `user_id` (= auth.users.id) — анониму она видна. Заодно
-- имя автора анониму НЕ приходит: join к `profiles` закрыт RLS, и под чужим
-- вопросом стоит пусто.
--
-- Делаем как у отзывов (20260907200000): SECURITY DEFINER-функция публичного
-- списка отдаёт имя автора и `is_mine` (мой ли вопрос — для кнопки удаления),
-- но не внутренний id. Прямое чтение `user_id` анониму закрыто привилегией.
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.get_product_questions(p_product_id uuid)
RETURNS TABLE(
  id uuid,
  product_id uuid,
  is_mine boolean,
  question_text text,
  answer_text text,
  answered_at timestamptz,
  is_published boolean,
  is_auto_generated boolean,
  created_at timestamptz,
  profiles jsonb
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    q.id,
    q.product_id,
    (auth.uid() IS NOT NULL AND auth.uid() = q.user_id) AS is_mine,
    q.question_text,
    q.answer_text,
    q.answered_at,
    q.is_published,
    q.is_auto_generated,
    q.created_at,
    -- Имя автора отдаём и анониму (профиль напрямую ему закрыт). У
    -- автосгенерированных вопросов автора нет — там NULL.
    CASE
      WHEN pr.id IS NULL THEN NULL
      ELSE jsonb_build_object('first_name', pr.first_name, 'last_name', pr.last_name)
    END AS profiles
  FROM product_questions q
  LEFT JOIN profiles pr ON pr.id = q.user_id
  WHERE q.product_id = p_product_id
    AND q.is_published = TRUE
  ORDER BY q.created_at DESC;
$function$;

COMMENT ON FUNCTION public.get_product_questions(uuid) IS
'Публичный список вопросов товара: имя автора и is_mine, без внутреннего user_id.';

GRANT EXECUTE ON FUNCTION public.get_product_questions(uuid) TO anon, authenticated;

-- Прямое чтение user_id анониму закрыто; публичный список идёт через функцию.
REVOKE SELECT ON public.product_questions FROM anon;
GRANT SELECT (
  id, product_id, question_text, answer_text, answered_by, answered_at,
  is_published, is_auto_generated, created_at, updated_at
) ON public.product_questions TO anon;

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
BEGIN
  IF has_column_privilege('anon', 'public.product_questions', 'user_id', 'SELECT') THEN
    RAISE EXCEPTION 'anon всё ещё читает product_questions.user_id';
  END IF;

  RAISE NOTICE '✅ Вопросы: user_id закрыт, публичный список через is_mine';
END $$;

NOTIFY pgrst, 'reload schema';
