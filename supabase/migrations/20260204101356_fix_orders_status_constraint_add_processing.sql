-- ============================================================================
-- FIX: Добавление статуса 'processing' в CHECK constraint
-- ============================================================================
-- ПРОБЛЕМА:
-- Edge Function assign-order-to-admin устанавливает status = 'processing'
-- Но CHECK constraint не разрешает это значение на продакшене
-- Ошибка: new row for relation "orders" violates check constraint "orders_status_check"
--
-- РЕШЕНИЕ:
-- Пересоздаём CHECK constraint с полным списком статусов включая 'processing'
-- ============================================================================

-- Удаляем старый constraint для orders
ALTER TABLE public.orders
DROP CONSTRAINT IF EXISTS orders_status_check;

-- Создаём новый constraint с полным списком статусов
ALTER TABLE public.orders
ADD CONSTRAINT orders_status_check
CHECK (status = ANY (ARRAY[
  'pending'::text,
  'new'::text,
  'processing'::text,
  'confirmed'::text,
  'delivered'::text,
  'shipped'::text,
  'completed'::text,
  'cancelled'::text
]));

-- Удаляем старый constraint для guest_checkouts
ALTER TABLE public.guest_checkouts
DROP CONSTRAINT IF EXISTS guest_checkouts_status_check;

-- Создаём новый constraint с полным списком статусов
ALTER TABLE public.guest_checkouts
ADD CONSTRAINT guest_checkouts_status_check
CHECK (status = ANY (ARRAY[
  'pending'::text,
  'new'::text,
  'processing'::text,
  'confirmed'::text,
  'delivered'::text,
  'shipped'::text,
  'completed'::text,
  'cancelled'::text
]));

COMMENT ON CONSTRAINT orders_status_check ON public.orders IS
'Допустимые статусы заказа:
- pending: ожидает обработки
- new: новый заказ
- processing: в обработке (админ взял в работу)
- confirmed: подтверждён
- delivered: доставлен
- shipped: отправлен
- completed: завершён
- cancelled: отменён';

COMMENT ON CONSTRAINT guest_checkouts_status_check ON public.guest_checkouts IS
'Допустимые статусы гостевого заказа. Аналогично orders.';

-- Проверяем что constraint применён
DO $$
DECLARE
  v_orders_constraint TEXT;
  v_guest_constraint TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_orders_constraint
  FROM pg_constraint
  WHERE conrelid = 'orders'::regclass
    AND conname = 'orders_status_check';

  SELECT pg_get_constraintdef(oid) INTO v_guest_constraint
  FROM pg_constraint
  WHERE conrelid = 'guest_checkouts'::regclass
    AND conname = 'guest_checkouts_status_check';

  IF v_orders_constraint LIKE '%processing%' THEN
    RAISE NOTICE '✅ orders_status_check includes processing';
  ELSE
    RAISE EXCEPTION '❌ orders_status_check does not include processing';
  END IF;

  IF v_guest_constraint LIKE '%processing%' THEN
    RAISE NOTICE '✅ guest_checkouts_status_check includes processing';
  ELSE
    RAISE EXCEPTION '❌ guest_checkouts_status_check does not include processing';
  END IF;
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
