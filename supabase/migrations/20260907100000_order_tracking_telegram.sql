-- =====================================================================================
-- ОТСЛЕЖИВАНИЕ ЗАКАЗА В TELEGRAM — В ТОМ ЧИСЛЕ ДЛЯ ГОСТЕЙ
-- =====================================================================================
-- ЧТО БЫЛО. Уведомления покупателю работают только для зарегистрированных:
-- триггер `notify_user_order_status_changed` начинается с
-- `IF NEW.user_id IS NULL THEN RETURN` — гостевой заказ отсекается первой
-- строкой. Дальше запись в `notifications` уезжает в Telegram триггером
-- `trigger_telegram_on_notification`, но только тем, кто привязал аккаунт.
--
-- Данные на 7 сентября 2026: профилей всего 10, Telegram привязан у двоих,
-- а гостевых заказов за 90 дней — 6 из 22. То есть большинство покупателей о
-- судьбе своего заказа не узнаёт ничего.
--
-- ЧТО ДЕЛАЕМ. У каждого заказа появляется код отслеживания. Покупатель на
-- странице «заказ принят» жмёт кнопку, попадает в бота, бот запоминает его чат
-- за этим заказом — и присылает статусы. Регистрация не нужна.
--
-- Код случайный, а не номер заказа: номер видно в чужой переписке и на чеке, и
-- по нему можно было бы подписаться на чужой заказ.
-- =====================================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id BIGINT;

-- Код проставляется сам при создании заказа и не меняется.
CREATE OR REPLACE FUNCTION public.set_tracking_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tracking_code IS NULL THEN
    /*
     * Только ядро Postgres: `gen_random_bytes` живёт в pgcrypto, а он на
     * Supabase лежит в схеме `extensions` — с `search_path = public` функция
     * его не находит, и вставка заказа падала бы с
     * «function gen_random_bytes(integer) does not exist». Оформление заказа
     * — последнее место, где можно позволить себе такую зависимость.
     */
    NEW.tracking_code := substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_tracking_code ON public.orders;
CREATE TRIGGER set_tracking_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_code();

DROP TRIGGER IF EXISTS set_tracking_code ON public.guest_checkouts;
CREATE TRIGGER set_tracking_code
  BEFORE INSERT ON public.guest_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.set_tracking_code();

-- Старым заказам код тоже нужен: покупатель может открыть страницу заказа,
-- оформленного до этой миграции.
UPDATE public.orders
SET tracking_code = substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12)
WHERE tracking_code IS NULL;

UPDATE public.guest_checkouts
SET tracking_code = substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12)
WHERE tracking_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_tracking_code
  ON public.orders (tracking_code);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_checkouts_tracking_code
  ON public.guest_checkouts (tracking_code);

-- =====================================================================================
-- Настройки, которые нужны триггерам
-- =====================================================================================
-- Пока здесь одна: базовый адрес эдж-функций. На проде строки нет — работает
-- значение по умолчанию; на локальном стенде строка появляется и разворачивает
-- вызовы на локальные функции.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.app_settings IS
'Настройки для триггеров. Доступ только у service_role: политик нет намеренно.';

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- =====================================================================================
-- Отправка статуса покупателю, который подписался на заказ
-- =====================================================================================
-- Дублей не будет: если у покупателя привязан профиль, его уже обслуживает
-- цепочка notifications → trigger_telegram_on_notification. Здесь отправляем
-- только тем, у кого этой цепочки нет, — гостям и незалогиненным.

CREATE OR REPLACE FUNCTION public.notify_order_subscriber()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_chat_id BIGINT;
  v_profile_chat BIGINT;
  v_title TEXT;
  v_body TEXT;
  v_number TEXT;
  v_base TEXT;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  v_chat_id := NEW.telegram_chat_id;
  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  /*
   * Зарегистрированному с привязанным профилем то же самое уже уходит через
   * notifications — второй раз не шлём.
   *
   * Проверки ВЛОЖЕНЫ, а не соединены через AND: SQL не обещает порядок
   * вычисления операндов, и `TG_TABLE_NAME = 'orders' AND NEW.user_id ...`
   * падало на гостевой таблице с «record new has no field user_id» — там
   * такой колонки нет. Триггер при этом молча уходил в EXCEPTION, и
   * покупатель не получал ничего.
   */
  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.user_id IS NOT NULL THEN
      SELECT telegram_chat_id INTO v_profile_chat FROM public.profiles WHERE id = NEW.user_id;
      IF v_profile_chat IS NOT NULL THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  v_number := right(NEW.id::text, 6);

  CASE NEW.status
    WHEN 'confirmed' THEN
      v_title := '✅ Заказ подтверждён';
      v_body := format('Заказ №%s подтверждён и собирается.', v_number);
    WHEN 'processing' THEN
      v_title := '⚙️ Заказ в работе';
      v_body := format('Заказ №%s взят в работу.', v_number);
    WHEN 'shipped' THEN
      v_title := '🚚 Заказ в пути';
      v_body := CASE
        WHEN NEW.delivery_method = 'pickup'
          THEN format('Заказ №%s готов к выдаче.', v_number)
        ELSE format('Заказ №%s передан курьеру.', v_number)
      END;
    WHEN 'delivered' THEN
      v_title := '📦 Заказ доставлен';
      v_body := format('Заказ №%s доставлен. Спасибо за покупку!', v_number);
    WHEN 'cancelled' THEN
      v_title := '❌ Заказ отменён';
      v_body := format('Заказ №%s отменён. Если это ошибка — напишите нам.', v_number);
    ELSE
      RETURN NEW;
  END CASE;

  /*
   * Адрес функций берём из таблицы настроек, а не зашиваем намертво.
   *
   * У всех прежних триггеров проекта прод-адрес вписан прямо в тело, и на
   * локальной базе они стучатся в БОЕВЫЕ функции: доставку сообщения
   * покупателю на стенде не проверить, а смена статуса локально дёргает прод.
   * Через `current_setting` это не решается — с PostgreSQL 15 задать свой
   * параметр может только суперпользователь, которого на Supabase нет
   * (проверено: «permission denied to set parameter»). Поэтому обычная
   * таблица: на проде она пустая и берётся значение по умолчанию, на стенде
   * — одна строка с локальным адресом.
   */
  SELECT value INTO v_base FROM public.app_settings WHERE key = 'functions_url';

  PERFORM net.http_post(
    url := coalesce(v_base, 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1')
           || '/send-user-telegram',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('chat_id', v_chat_id, 'title', v_title, 'body', v_body)
  );

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_order_subscriber: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_order_subscriber ON public.orders;
CREATE TRIGGER notify_order_subscriber
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_subscriber();

DROP TRIGGER IF EXISTS notify_order_subscriber ON public.guest_checkouts;
CREATE TRIGGER notify_order_subscriber
  AFTER UPDATE OF status ON public.guest_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.notify_order_subscriber();

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
DECLARE
  v_cols INTEGER;
  v_orders_without INTEGER;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
  WHERE table_name IN ('orders', 'guest_checkouts')
    AND column_name IN ('tracking_code', 'telegram_chat_id');

  IF v_cols <> 4 THEN
    RAISE EXCEPTION 'Ожидались четыре колонки отслеживания, найдено %', v_cols;
  END IF;

  SELECT count(*) INTO v_orders_without FROM public.orders WHERE tracking_code IS NULL;
  IF v_orders_without > 0 THEN
    RAISE EXCEPTION 'У % заказов не проставлен код отслеживания', v_orders_without;
  END IF;

  -- Проверяем не наличие функции, а её работу: именно на зависимости от
  -- pgcrypto эта миграция уже спотыкалась.
  IF substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 12) IS NULL THEN
    RAISE EXCEPTION 'Генератор кода отслеживания не работает';
  END IF;

  RAISE NOTICE '✅ Отслеживание заказа в Telegram готово';
END $$;

NOTIFY pgrst, 'reload schema';
