-- =====================================================================================
-- Fix: activation_date не заполнялся в bonus_transactions + бэкфилл earned записей
--
-- ПРИМЕЧАНИЕ: Функции cancel_order, create_user_order, process_confirmed_order
-- окончательно пересозданы в миграции 20260304000004.
-- Эта миграция только добавляет бэкфилл activation_date.
-- =====================================================================================

-- Проставить activation_date для существующих earned записей с confirmed/delivered заказами
UPDATE public.bonus_transactions bt
SET activation_date = o.bonuses_activation_date
FROM public.orders o
WHERE bt.order_id = o.id
  AND bt.transaction_type = 'earned'
  AND bt.activation_date IS NULL
  AND o.bonuses_activation_date IS NOT NULL;

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
