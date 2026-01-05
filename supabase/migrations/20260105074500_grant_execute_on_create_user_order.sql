-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Явно разрешаем выполнение create_user_order для authenticated
-- =====================================================================================
-- Проблема:
-- - Функция create_user_order не может обновлять profiles из-за RLS
-- - SECURITY DEFINER должен обходить RLS, но возможно нужны доп. права
--
-- Решение:
-- - Явно GRANT EXECUTE на функцию для authenticated и service_role
-- - Убеждаемся что функция может обновлять таблицу profiles
-- =====================================================================================

-- Разрешаем выполнение функции для authenticated users
GRANT EXECUTE ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER) TO service_role;

-- Также разрешаем для других связанных функций
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION public.confirm_and_process_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_and_process_order(UUID) TO service_role;

-- Убеждаемся что authenticated может UPDATE profiles (через RLS)
GRANT UPDATE ON public.profiles TO authenticated;
GRANT UPDATE ON public.profiles TO service_role;

COMMENT ON FUNCTION public.create_user_order(JSONB, TEXT, TEXT, JSONB, INTEGER) IS
'Создает новый заказ для авторизованного пользователя с поддержкой бонусной системы.

ИСПРАВЛЕНИЕ v1.2 (2026-01-05):
  - Добавлены явные GRANT EXECUTE для authenticated и service_role
  - Добавлены GRANT UPDATE на таблицу profiles
  - Это гарантирует что функция может обновлять бонусный баланс';
