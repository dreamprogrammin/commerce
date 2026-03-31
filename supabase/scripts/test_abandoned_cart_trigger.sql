-- ============================================================================
-- Тест: принудительный запуск check_abandoned_carts()
-- ============================================================================
-- ВНИМАНИЕ: Этот скрипт ОТПРАВИТ реальные Telegram-уведомления!
-- Запускать только для тестирования.
-- ============================================================================

-- Шаг 1: Посмотреть, какие корзины попадут под напоминание
-- (без отправки, только SELECT)

SELECT
  sc.id,
  sc.user_id,
  p.full_name,
  p.telegram_chat_id,
  jsonb_array_length(sc.items) AS items_count,
  sc.total_amount,
  sc.updated_at,
  sc.reminder_1h_sent,
  sc.reminder_24h_sent,
  ROUND(EXTRACT(EPOCH FROM (now() - sc.updated_at)) / 3600, 1) AS hours_ago
FROM server_carts sc
JOIN profiles p ON p.id = sc.user_id
WHERE (
  -- Кандидаты на 1ч напоминание
  (sc.updated_at < now() - interval '1 hour' AND sc.reminder_1h_sent = false)
  OR
  -- Кандидаты на 24ч напоминание
  (sc.updated_at < now() - interval '24 hours' AND sc.reminder_1h_sent = true AND sc.reminder_24h_sent = false)
)
AND jsonb_array_length(sc.items) > 0
AND NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.user_id = sc.user_id AND o.created_at > sc.updated_at
);

-- Шаг 2: Запустить функцию (раскомментировать для запуска)
-- SELECT public.check_abandoned_carts();

-- Шаг 3: Проверить результат (после запуска)
-- SELECT id, user_id, reminder_1h_sent, reminder_24h_sent, updated_at
-- FROM server_carts
-- ORDER BY updated_at DESC
-- LIMIT 10;
