-- Удаление Web Push уведомлений (переход на Telegram)

-- 1. Удалить триггер отправки push при новом уведомлении
DROP TRIGGER IF EXISTS trigger_push_on_notification ON notifications;

-- 2. Удалить функцию триггера
DROP FUNCTION IF EXISTS trigger_send_push_notification();

-- 3. Удалить таблицу подписок на Web Push
DROP TABLE IF EXISTS push_subscriptions;
