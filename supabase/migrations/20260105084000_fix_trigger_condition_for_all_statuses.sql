-- =====================================================================================
-- ИСПРАВЛЕНИЕ: Триггер должен срабатывать для ВСЕХ статусов при подтверждении
-- =====================================================================================
-- Проблема:
-- - Триггер срабатывает только при изменении статуса с 'new' на 'confirmed'
-- - Но заказ может быть в статусе 'pending', 'processing' и т.д.
-- - Триггер НЕ срабатывает и товары НЕ списываются ❌
--
-- Решение:
-- - Убрать условие OLD.status = 'new'
-- - Триггер будет срабатывать при изменении на 'confirmed' из ЛЮБОГО статуса
-- - Но только если заказ раньше НЕ был подтвержден (проверка внутри функции)
-- =====================================================================================

-- ✅ Пересоздаем триггер для orders БЕЗ условия на OLD.status
DROP TRIGGER IF EXISTS trigger_auto_confirm_order ON public.orders;

CREATE TRIGGER trigger_auto_confirm_order
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status != 'confirmed')  -- Любой статус → confirmed
  EXECUTE FUNCTION public.trigger_process_confirmed_order();

-- ✅ Пересоздаем триггер для guest_checkouts БЕЗ условия на OLD.status
DROP TRIGGER IF EXISTS trigger_auto_confirm_guest_checkout ON public.guest_checkouts;

CREATE TRIGGER trigger_auto_confirm_guest_checkout
  AFTER UPDATE ON public.guest_checkouts
  FOR EACH ROW
  WHEN (NEW.status = 'confirmed' AND OLD.status != 'confirmed')  -- Любой статус → confirmed
  EXECUTE FUNCTION public.trigger_process_confirmed_guest_checkout();

-- Обновляем комментарии
COMMENT ON TRIGGER trigger_auto_confirm_order ON public.orders IS
'Автоматически обрабатывает заказ при подтверждении.
Срабатывает при изменении статуса на confirmed из ЛЮБОГО статуса (new, pending, processing и т.д.).
Работает когда администратор подтверждает заказ через Telegram бота.';

COMMENT ON TRIGGER trigger_auto_confirm_guest_checkout ON public.guest_checkouts IS
'Автоматически обрабатывает гостевой заказ при подтверждении.
Срабатывает при изменении статуса на confirmed из ЛЮБОГО статуса.
Работает когда администратор подтверждает заказ через Telegram бота.';
