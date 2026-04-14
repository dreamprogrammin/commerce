-- Удаляем дублирующий триггер
DROP TRIGGER IF EXISTS guest_checkouts_telegram_notification_v2 ON public.guest_checkouts;

-- Проверка
DO $$
DECLARE
  v_trigger_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_trigger_count
  FROM information_schema.triggers
  WHERE event_object_table = 'guest_checkouts'
    AND event_object_schema = 'public'
    AND event_manipulation = 'INSERT'
    AND action_statement LIKE '%notify_guest_checkout_to_telegram%';

  IF v_trigger_count = 1 THEN
    RAISE NOTICE '✅ Остался только один триггер для уведомлений';
  ELSE
    RAISE WARNING '⚠️ Найдено триггеров: %', v_trigger_count;
  END IF;
END $$;
