-- =====================================================================================
-- Политики «Service ...» из 20260221000001_user_notifications_and_telegram.sql
-- задумывались для service_role, но создавались без указания TO service_role.
-- По умолчанию политика действует TO public, куда входит anon, а permissive-политики
-- складываются по ИЛИ — поэтому эти три перекрывали корректные правила рядом
-- (auth.uid() = user_id) и открывали таблицы всем, у кого есть публичный anon-ключ.
--
-- Удаляем их, а не переписываем на TO service_role: они не нужны в принципе.
--   • у service_role стоит BYPASSRLS — RLS он игнорирует независимо от политик;
--   • все функции, пишущие в notifications, объявлены SECURITY DEFINER и выполняются
--     от владельца таблиц (postgres), а FORCE ROW LEVEL SECURITY не включён,
--     то есть RLS к ним не применяется;
--   • edge-функции send-broadcast и notify-question-answered ходят
--     с SUPABASE_SERVICE_ROLE_KEY.
-- =====================================================================================

-- FOR ALL USING (true) WITH CHECK (true).
-- Позволяла анониму читать чужие коды привязки Telegram вместе с user_id
-- (код — единственное, что связывает чат с аккаунтом в telegram-webhook),
-- вставлять коды на любой user_id и удалять любые.
DROP POLICY IF EXISTS "Service manage all link codes" ON public.telegram_link_codes;

-- FOR INSERT WITH CHECK (true).
-- Позволяла анониму создать уведомление любому пользователю, а триггер
-- trigger_telegram_on_notification доставил бы его в Telegram с произвольными
-- title/body/link от имени бота магазина. Чужие user_id при этом перечислимы
-- из публично читаемых product_reviews и product_questions.
DROP POLICY IF EXISTS "Service insert" ON public.notifications;

-- FOR INSERT WITH CHECK (true).
-- Позволяла анониму дописывать записи в историю рассылок.
DROP POLICY IF EXISTS "Service insert broadcasts" ON public.telegram_broadcasts;
