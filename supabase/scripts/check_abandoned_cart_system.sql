-- ============================================================================
-- Диагностика системы брошенных корзин
-- Запускать в Supabase Dashboard → SQL Editor
-- ============================================================================

-- 1. pg_cron: проверяем что расширение включено и задача существует
SELECT '=== 1. pg_cron ===' AS section;

SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'pg_cron'
) AS pg_cron_enabled;

SELECT jobid, jobname, schedule, command, active
FROM cron.job
WHERE jobname ILIKE '%cart%' OR jobname ILIKE '%abandon%';

-- 2. pg_net: проверяем что расширение включено
SELECT '=== 2. pg_net ===' AS section;

SELECT EXISTS (
  SELECT 1 FROM pg_extension WHERE extname = 'pg_net'
) AS pg_net_enabled;

-- 3. App settings: проверяем URL для Edge Function
SELECT '=== 3. App Settings ===' AS section;

SELECT
  current_setting('app.settings.supabase_url', true) AS supabase_url,
  CASE
    WHEN current_setting('app.settings.supabase_url', true) IS NULL THEN 'BROKEN: supabase_url не настроен!'
    ELSE 'OK'
  END AS status;

-- 4. server_carts: статистика
SELECT '=== 4. server_carts ===' AS section;

SELECT
  COUNT(*) AS total_carts,
  COUNT(*) FILTER (WHERE jsonb_array_length(items) > 0) AS non_empty_carts,
  COUNT(*) FILTER (WHERE reminder_1h_sent = true) AS reminder_1h_sent,
  COUNT(*) FILTER (WHERE reminder_24h_sent = true) AS reminder_24h_sent,
  COUNT(*) FILTER (
    WHERE jsonb_array_length(items) > 0
      AND reminder_1h_sent = false
      AND updated_at < now() - interval '1 hour'
  ) AS pending_1h_reminders,
  COUNT(*) FILTER (
    WHERE jsonb_array_length(items) > 0
      AND reminder_1h_sent = true
      AND reminder_24h_sent = false
      AND updated_at < now() - interval '24 hours'
  ) AS pending_24h_reminders
FROM server_carts;

-- 5. Последние 10 корзин (есть ли вообще данные?)
SELECT '=== 5. Последние корзины ===' AS section;

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
LEFT JOIN profiles p ON p.id = sc.user_id
ORDER BY sc.updated_at DESC
LIMIT 10;

-- 6. Корзины, которые ДОЛЖНЫ были получить 1ч напоминание, но не получили
SELECT '=== 6. Пропущенные 1ч напоминания ===' AS section;

SELECT
  sc.id,
  sc.user_id,
  p.full_name,
  p.telegram_chat_id,
  jsonb_array_length(sc.items) AS items_count,
  sc.total_amount,
  sc.updated_at,
  ROUND(EXTRACT(EPOCH FROM (now() - sc.updated_at)) / 3600, 1) AS hours_ago,
  CASE
    WHEN p.telegram_chat_id IS NULL THEN 'НЕТ telegram_chat_id'
    ELSE 'Telegram OK'
  END AS telegram_status,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM orders o
      WHERE o.user_id = sc.user_id AND o.created_at > sc.updated_at
    ) THEN 'Есть заказ после корзины (OK — не abandoned)'
    ELSE 'Нет заказа — ДОЛЖЕН получить напоминание'
  END AS order_status
FROM server_carts sc
LEFT JOIN profiles p ON p.id = sc.user_id
WHERE sc.updated_at < now() - interval '1 hour'
  AND sc.reminder_1h_sent = false
  AND jsonb_array_length(sc.items) > 0
ORDER BY sc.updated_at ASC;

-- 7. pg_net: последние HTTP-запросы (ответы от Edge Functions)
SELECT '=== 7. pg_net HTTP responses ===' AS section;

SELECT
  id,
  status_code,
  created,
  content::text AS response_body
FROM net._http_response
ORDER BY created DESC
LIMIT 10;

-- 8. cron: последние запуски
SELECT '=== 8. cron job runs ===' AS section;

SELECT
  jobid,
  job_pid,
  database,
  command,
  status,
  return_message,
  start_time,
  end_time
FROM cron.job_run_details
WHERE command ILIKE '%abandoned%' OR command ILIKE '%check_abandoned%'
ORDER BY start_time DESC
LIMIT 10;

-- 9. Notifications: проверяем что in-app уведомления создаются
SELECT '=== 9. Abandoned cart notifications ===' AS section;

SELECT
  id,
  user_id,
  type,
  title,
  is_read,
  created_at
FROM notifications
WHERE type = 'abandoned_cart'
ORDER BY created_at DESC
LIMIT 10;

-- 10. Promo codes: сгенерированные для abandoned cart
SELECT '=== 10. Промокоды TG5-* ===' AS section;

SELECT
  id,
  code,
  user_id,
  discount_percent,
  max_uses,
  uses_count,
  expires_at,
  CASE
    WHEN expires_at < now() THEN 'EXPIRED'
    ELSE 'ACTIVE'
  END AS status,
  created_at
FROM promo_codes
WHERE code LIKE 'TG5-%'
ORDER BY created_at DESC
LIMIT 10;
