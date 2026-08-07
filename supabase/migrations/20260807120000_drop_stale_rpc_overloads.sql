-- ============================================================================
--  Удаление мёртвых перегрузок функций оформления
-- ============================================================================
--  ЗАЧЕМ. Рядом с актуальными функциями в проде остались их прежние версии:
--  create_guest_checkout на 5 аргументов и create_user_order на 6. Ими никто
--  не пользуется — фронт давно шлёт полный набор параметров, — но они не
--  безобидны: у актуальных версий все лишние параметры имеют DEFAULT, поэтому
--  вызов коротким набором имён подходит обеим сразу, и Postgres отвечает
--  «function is not unique». Это не теория: ошибка воспроизвелась при проверке
--  промокода обычным вызовом с шестью именованными аргументами.
--
--  Заодно снимаем промежуточные версии, появлявшиеся по ходу работы над
--  комментарием и временем доставки. Все DROP идут с IF EXISTS: в разных
--  окружениях набор перегрузок отличается, отсутствие любой из них — норма.
--
--  Актуальные версии (guest на 10 аргументов, user на 12) не трогаются.
-- ============================================================================

-- create_guest_checkout: прежние версии
DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC, TEXT);

-- create_user_order: прежние версии
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, JSONB, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER, TEXT, TEXT, TEXT, NUMERIC);

-- Проверяем, что каждая функция осталась ровно в одном экземпляре.
DO $$
DECLARE
  v_guest INTEGER;
  v_user  INTEGER;
BEGIN
  SELECT count(*) INTO v_guest FROM pg_proc
   WHERE proname = 'create_guest_checkout' AND pronamespace = 'public'::regnamespace;
  SELECT count(*) INTO v_user FROM pg_proc
   WHERE proname = 'create_user_order' AND pronamespace = 'public'::regnamespace;

  IF v_guest <> 1 OR v_user <> 1 THEN
    RAISE EXCEPTION 'Ожидали по одной версии функций оформления, осталось: create_guest_checkout=%, create_user_order=%', v_guest, v_user;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
