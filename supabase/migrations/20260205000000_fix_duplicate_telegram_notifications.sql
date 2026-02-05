-- =====================================================================================
-- FIX: Дублирующиеся уведомления в Telegram
-- =====================================================================================
-- ПРОБЛЕМА:
-- Одно уведомление приходит дважды в Telegram из-за дублирующихся триггеров
--
-- ПРИЧИНА:
-- Старые миграции создали триггеры с разными именами на одних таблицах:
--   orders: on_new_order_created_send_notification + trigger_notify_user_order
--   guest_checkouts: может быть несколько версий триггеров
--
-- РЕШЕНИЕ:
-- 1. Удаляем ВСЕ триггеры, связанные с Telegram уведомлениями
-- 2. Удаляем устаревшие функции
-- 3. Создаём правильные функции и триггеры (по одному на таблицу)
-- =====================================================================================

-- =====================================================================================
-- ШАГ 1: УДАЛЯЕМ ВСЕ СТАРЫЕ ТРИГГЕРЫ УВЕДОМЛЕНИЙ
-- =====================================================================================

-- Сначала получим список всех триггеров на orders (для логирования)
DO $$
DECLARE
  trigger_rec RECORD;
BEGIN
  RAISE NOTICE '📋 Триггеры на таблице orders ДО очистки:';
  FOR trigger_rec IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND event_object_schema = 'public'
    ORDER BY trigger_name
  LOOP
    RAISE NOTICE '   - %', trigger_rec.trigger_name;
  END LOOP;
END $$;

-- Удаляем все возможные версии триггеров уведомлений на таблице orders
DROP TRIGGER IF EXISTS on_new_order_created_send_notification ON public.orders;
DROP TRIGGER IF EXISTS trigger_notify_user_order ON public.orders;
DROP TRIGGER IF EXISTS notify_order_telegram ON public.orders;
DROP TRIGGER IF EXISTS order_notification_trigger ON public.orders;
DROP TRIGGER IF EXISTS trigger_order_notification ON public.orders;
DROP TRIGGER IF EXISTS send_order_notification ON public.orders;

-- Список триггеров на guest_checkouts (для логирования)
DO $$
DECLARE
  trigger_rec RECORD;
BEGIN
  RAISE NOTICE '📋 Триггеры на таблице guest_checkouts ДО очистки:';
  FOR trigger_rec IN
    SELECT trigger_name
    FROM information_schema.triggers
    WHERE event_object_table = 'guest_checkouts'
      AND event_object_schema = 'public'
    ORDER BY trigger_name
  LOOP
    RAISE NOTICE '   - %', trigger_rec.trigger_name;
  END LOOP;
END $$;

-- Удаляем все возможные версии триггеров уведомлений на таблице guest_checkouts
DROP TRIGGER IF EXISTS trigger_notify_guest_checkout ON public.guest_checkouts;
DROP TRIGGER IF EXISTS on_guest_checkout_created_send_notification ON public.guest_checkouts;
DROP TRIGGER IF EXISTS notify_guest_checkout_telegram ON public.guest_checkouts;
DROP TRIGGER IF EXISTS guest_checkout_notification_trigger ON public.guest_checkouts;

-- =====================================================================================
-- ШАГ 2: УДАЛЯЕМ УСТАРЕВШИЕ ФУНКЦИИ
-- =====================================================================================

DROP FUNCTION IF EXISTS public.trigger_order_notification();
DROP FUNCTION IF EXISTS public.notify_order_telegram();

-- =====================================================================================
-- ШАГ 3: СОЗДАЁМ ПРАВИЛЬНЫЕ ФУНКЦИИ
-- =====================================================================================

-- Функция для уведомлений о заказах пользователей
CREATE OR REPLACE FUNCTION public.notify_user_order_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
  request_id BIGINT;
BEGIN
  -- URL Edge Function
  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';

  -- Формируем payload с указанием таблицы
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', 'orders',
    'operation', TG_OP
  );

  -- Отправляем HTTP запрос
  SELECT INTO request_id
    net.http_post(
      url := function_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );

  RAISE NOTICE '📤 [ORDERS] Уведомление о заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ [ORDERS] Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW; -- Не ломаем транзакцию
END;
$$;

COMMENT ON FUNCTION public.notify_user_order_to_telegram IS
  'Отправляет уведомление о заказе пользователя в Telegram через Edge Function';

-- Функция для уведомлений о гостевых заказах
CREATE OR REPLACE FUNCTION public.notify_guest_checkout_to_telegram()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  function_url TEXT;
  payload JSONB;
  request_id BIGINT;
BEGIN
  -- URL Edge Function
  function_url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-order-to-telegram';

  -- Формируем payload с указанием таблицы
  payload := jsonb_build_object(
    'record', row_to_json(NEW),
    'table', 'guest_checkouts',
    'operation', TG_OP
  );

  -- Отправляем HTTP запрос
  SELECT INTO request_id
    net.http_post(
      url := function_url,
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json'
      )
    );

  RAISE NOTICE '📤 [GUEST] Уведомление о гостевом заказе % отправлено (request_id: %)', NEW.id, request_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '⚠️ [GUEST] Ошибка отправки уведомления: %', SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_guest_checkout_to_telegram IS
  'Отправляет уведомление о гостевом заказе в Telegram через Edge Function';

-- =====================================================================================
-- ШАГ 4: СОЗДАЁМ ТРИГГЕРЫ (ПО ОДНОМУ НА ТАБЛИЦУ!)
-- =====================================================================================

-- Триггер для заказов пользователей
CREATE TRIGGER trigger_notify_user_order
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_order_to_telegram();

COMMENT ON TRIGGER trigger_notify_user_order ON public.orders IS
  'Отправляет уведомление в Telegram при создании заказа пользователя';

-- Триггер для гостевых заказов
CREATE TRIGGER trigger_notify_guest_checkout
  AFTER INSERT ON public.guest_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_guest_checkout_to_telegram();

COMMENT ON TRIGGER trigger_notify_guest_checkout ON public.guest_checkouts IS
  'Отправляет уведомление в Telegram при создании гостевого заказа';

-- =====================================================================================
-- ШАГ 5: ПРОВЕРКА НАСТРОЙКИ
-- =====================================================================================

DO $$
DECLARE
  v_orders_telegram_trigger BOOLEAN;
  v_guest_telegram_trigger BOOLEAN;
  v_old_trigger_exists BOOLEAN;
BEGIN
  -- Проверяем наличие правильных триггеров для Telegram
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND event_object_schema = 'public'
      AND trigger_name = 'trigger_notify_user_order'
  ) INTO v_orders_telegram_trigger;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'guest_checkouts'
      AND event_object_schema = 'public'
      AND trigger_name = 'trigger_notify_guest_checkout'
  ) INTO v_guest_telegram_trigger;

  -- Проверяем отсутствие старого дублирующего триггера
  SELECT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND event_object_schema = 'public'
      AND trigger_name = 'on_new_order_created_send_notification'
  ) INTO v_old_trigger_exists;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'ПРОВЕРКА ТРИГГЕРОВ TELEGRAM';
  RAISE NOTICE '========================================';

  -- Проверка триггера orders
  IF v_orders_telegram_trigger THEN
    RAISE NOTICE '✅ Триггер trigger_notify_user_order создан на таблице orders';
  ELSE
    RAISE WARNING '❌ Триггер trigger_notify_user_order НЕ НАЙДЕН на таблице orders';
  END IF;

  -- Проверка триггера guest_checkouts
  IF v_guest_telegram_trigger THEN
    RAISE NOTICE '✅ Триггер trigger_notify_guest_checkout создан на таблице guest_checkouts';
  ELSE
    RAISE WARNING '❌ Триггер trigger_notify_guest_checkout НЕ НАЙДЕН на таблице guest_checkouts';
  END IF;

  -- Проверка удаления старого триггера
  IF v_old_trigger_exists THEN
    RAISE WARNING '⚠️ ВНИМАНИЕ: Старый триггер on_new_order_created_send_notification всё ещё существует!';
    RAISE WARNING '   Это может вызвать дублирование уведомлений';
  ELSE
    RAISE NOTICE '✅ Старый триггер on_new_order_created_send_notification удалён';
  END IF;

  RAISE NOTICE '========================================';

  -- Итоговая валидация
  IF v_orders_telegram_trigger AND v_guest_telegram_trigger AND NOT v_old_trigger_exists THEN
    RAISE NOTICE '✅ ПРОБЛЕМА РЕШЕНА: Триггеры настроены правильно';
    RAISE NOTICE '   - Каждая таблица имеет правильный триггер для Telegram';
    RAISE NOTICE '   - Старые дублирующие триггеры удалены';
  ELSIF v_old_trigger_exists THEN
    RAISE WARNING '⚠️ ПРОБЛЕМА ЧАСТИЧНО РЕШЕНА: Старый триггер всё ещё существует';
    RAISE WARNING '   Попробуйте выполнить: DROP TRIGGER on_new_order_created_send_notification ON orders;';
  ELSE
    RAISE WARNING '⚠️ Не все триггеры установлены правильно';
  END IF;

  RAISE NOTICE '========================================';
END $$;

-- =====================================================================================
-- ШАГ 6: ПОКАЗЫВАЕМ ФИНАЛЬНОЕ СОСТОЯНИЕ ТРИГГЕРОВ
-- =====================================================================================

DO $$
DECLARE
  trigger_rec RECORD;
  v_orders_count INTEGER := 0;
  v_guest_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 ФИНАЛЬНОЕ СОСТОЯНИЕ ТРИГГЕРОВ';
  RAISE NOTICE '========================================';

  RAISE NOTICE '📋 Все триггеры на таблице orders:';
  FOR trigger_rec IN
    SELECT trigger_name, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'orders'
      AND event_object_schema = 'public'
    ORDER BY trigger_name
  LOOP
    RAISE NOTICE '   - % → %', trigger_rec.trigger_name, trigger_rec.action_statement;

    -- Считаем триггеры уведомлений
    IF trigger_rec.trigger_name LIKE '%notify%'
       OR trigger_rec.trigger_name LIKE '%notification%'
       OR trigger_rec.trigger_name LIKE '%telegram%' THEN
      v_orders_count := v_orders_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '📋 Все триггеры на таблице guest_checkouts:';
  FOR trigger_rec IN
    SELECT trigger_name, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'guest_checkouts'
      AND event_object_schema = 'public'
    ORDER BY trigger_name
  LOOP
    RAISE NOTICE '   - % → %', trigger_rec.trigger_name, trigger_rec.action_statement;

    -- Считаем триггеры уведомлений
    IF trigger_rec.trigger_name LIKE '%notify%'
       OR trigger_rec.trigger_name LIKE '%notification%'
       OR trigger_rec.trigger_name LIKE '%telegram%' THEN
      v_guest_count := v_guest_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '📊 ТРИГГЕРОВ УВЕДОМЛЕНИЙ:';
  RAISE NOTICE '   orders: %', v_orders_count;
  RAISE NOTICE '   guest_checkouts: %', v_guest_count;

  IF v_orders_count = 1 AND v_guest_count = 1 THEN
    RAISE NOTICE '✅ Идеально! По 1 триггеру уведомлений на каждой таблице';
  ELSIF v_orders_count > 1 OR v_guest_count > 1 THEN
    RAISE WARNING '⚠️ Внимание! Обнаружено дублирование триггеров уведомлений';
  END IF;

  RAISE NOTICE '========================================';
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
