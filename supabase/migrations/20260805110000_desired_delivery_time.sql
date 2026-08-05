-- ============================================================================
-- Желаемые дата и время доставки + выравнивание orders.comment
-- ============================================================================
-- ЗАЧЕМ:
-- В макете (Корзина.dc.html, блоки «Дата» и «Время») покупатель выбирает день
-- и двухчасовой интервал. Ни колонок, ни параметров RPC под это не было, и
-- поэтому блоки не переносились. Эта миграция готовит хранилище; параметры
-- функций и поля в форме приезжают следующим шагом, чтобы интерфейс не
-- показывал полей, значения которых некуда записать.
--
-- ПРО orders.comment:
-- Колонка есть в проде, но её нет в каталоге миграций — её заводили руками
-- мимо них. ADD COLUMN IF NOT EXISTS выравнивает локальную базу с продом и
-- на проде не делает ничего. Без этого `supabase db reset` даёт схему, в
-- которой комментарий заказа авторизованного пользователя хранить негде.
--
-- ПРО ТИП delivery_slot:
-- TEXT, а не enum и не ссылка на справочник: набор интервалов живёт в
-- интерфейсе и меняется под сезон и загрузку курьеров. Ради правки «18:00–20:00»
-- на «18:00–21:00» не должна требоваться миграция.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS comment       TEXT,
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_slot TEXT;

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS delivery_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_slot TEXT;

COMMENT ON COLUMN public.orders.comment IS
  'Комментарий покупателя к адресу: подъезд, этаж, домофон. Печатается в уведомлении Telegram.';
COMMENT ON COLUMN public.orders.delivery_date IS
  'Желаемая дата доставки, выбранная покупателем. NULL — покупатель не выбирал.';
COMMENT ON COLUMN public.orders.delivery_slot IS
  'Желаемый интервал доставки как показан покупателю, например «12:00–14:00».';

COMMENT ON COLUMN public.guest_checkouts.delivery_date IS
  'Желаемая дата доставки, выбранная покупателем. NULL — покупатель не выбирал.';
COMMENT ON COLUMN public.guest_checkouts.delivery_slot IS
  'Желаемый интервал доставки как показан покупателю, например «12:00–14:00».';

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
