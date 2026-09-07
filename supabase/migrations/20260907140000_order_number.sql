-- =====================================================================================
-- НОМЕР ЗАКАЗА — ЦИФРАМИ
-- =====================================================================================
-- Владелец: «номер заказа сделать цифры только без букв, а то тяжело
-- считывать». Номер собирался из хвоста UUID — «50B61F», «f973cb». Такое
-- невозможно продиктовать по телефону и легко перепутать: ноль и «O», единица
-- и «l».
--
-- Заводим настоящий сквозной номер. Одна последовательность на обе таблицы
-- заказов: покупателю всё равно, гостевой у него заказ или нет, а два
-- независимых счётчика дали бы два заказа №1043 в одном чате менеджеров.
--
-- Старт с 1000, чтобы номер сразу выглядел номером, а не порядковым «1».
-- Существующие заказы нумеруются по дате оформления — так номер растёт вместе
-- с историей.
-- =====================================================================================

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START WITH 1000;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_number BIGINT;

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS order_number BIGINT;

-- Нумеруем то, что уже есть: единым потоком по времени, вперемешку из обеих
-- таблиц — иначе гостевые и пользовательские номера шли бы двумя лестницами.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id, created_at, 'orders' AS src FROM public.orders WHERE order_number IS NULL
    UNION ALL
    SELECT id, created_at, 'guest_checkouts' FROM public.guest_checkouts WHERE order_number IS NULL
    ORDER BY created_at
  LOOP
    IF r.src = 'orders' THEN
      UPDATE public.orders SET order_number = nextval('public.order_number_seq') WHERE id = r.id;
    ELSE
      UPDATE public.guest_checkouts SET order_number = nextval('public.order_number_seq') WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := nextval('public.order_number_seq');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

DROP TRIGGER IF EXISTS set_order_number ON public.guest_checkouts;
CREATE TRIGGER set_order_number
  BEFORE INSERT ON public.guest_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_order_number
  ON public.orders (order_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_guest_checkouts_order_number
  ON public.guest_checkouts (order_number);

-- =====================================================================================
-- Тексты уведомлений тоже переводим на цифровой номер
-- =====================================================================================

CREATE OR REPLACE FUNCTION public.notify_user_order_status_changed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_title TEXT;
  v_body TEXT;
  v_order_short TEXT;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Раньше здесь было substring(id, 1, 8) — «3f0a91c2». Теперь человеческий
  -- номер; на всякий случай остаётся запасной вариант для строк без него.
  v_order_short := coalesce(NEW.order_number::text, right(NEW.id::text, 6));

  CASE NEW.status
    WHEN 'processing' THEN
      v_title := 'Заказ принят в обработку';
      v_body := format('Ваш заказ №%s принят в обработку', v_order_short);
    WHEN 'confirmed' THEN
      v_title := 'Заказ подтверждён';
      v_body := format('Ваш заказ №%s подтверждён и готовится к отправке', v_order_short);
    WHEN 'shipped' THEN
      v_title := 'Заказ отправлен';
      v_body := format('Ваш заказ №%s отправлен', v_order_short);
    WHEN 'delivered' THEN
      v_title := 'Заказ доставлен';
      v_body := format('Ваш заказ №%s успешно доставлен. Спасибо за покупку!', v_order_short);
    WHEN 'cancelled' THEN
      v_title := 'Заказ отменён';
      v_body := format('Ваш заказ №%s был отменён', v_order_short);
    ELSE
      RETURN NEW;
  END CASE;

  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'order_status', v_title, v_body, '/profile/orders');

  RETURN NEW;
END;
$$;

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

  IF TG_TABLE_NAME = 'orders' THEN
    IF NEW.user_id IS NOT NULL THEN
      SELECT telegram_chat_id INTO v_profile_chat FROM public.profiles WHERE id = NEW.user_id;
      IF v_profile_chat IS NOT NULL THEN
        RETURN NEW;
      END IF;
    END IF;
  END IF;

  v_number := coalesce(NEW.order_number::text, right(NEW.id::text, 6));

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

-- =====================================================================================
-- Номер заказа для страницы «заказ принят»
-- =====================================================================================
-- Гость свой заказ прочитать не может: RLS отдаёт `guest_checkouts` только
-- админам. Но номер ему показать надо — он на этой странице главный. Отдаём
-- ровно одно число по id заказа: id и так лежит в адресе страницы, ничего
-- нового этот вызов не раскрывает.

CREATE OR REPLACE FUNCTION public.order_number_by_id(p_order_id UUID)
RETURNS BIGINT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT order_number FROM public.orders WHERE id = p_order_id
  UNION ALL
  SELECT order_number FROM public.guest_checkouts WHERE id = p_order_id
  LIMIT 1
$$;

COMMENT ON FUNCTION public.order_number_by_id(UUID) IS
'Номер заказа по его id — для страницы «заказ принят». Отдаёт только число.';

GRANT EXECUTE ON FUNCTION public.order_number_by_id(UUID) TO anon, authenticated;

-- =====================================================================================
-- ПРОВЕРКА
-- =====================================================================================

DO $$
DECLARE
  v_missing INTEGER;
  v_dupes INTEGER;
BEGIN
  SELECT count(*) INTO v_missing FROM (
    SELECT 1 FROM public.orders WHERE order_number IS NULL
    UNION ALL
    SELECT 1 FROM public.guest_checkouts WHERE order_number IS NULL
  ) t;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'У % заказов нет номера', v_missing;
  END IF;

  -- Одна последовательность на две таблицы — проверяем, что номера не
  -- пересекаются: иначе в чате менеджеров было бы два «Заказ №1043».
  SELECT count(*) INTO v_dupes FROM (
    SELECT order_number FROM public.orders
    INTERSECT
    SELECT order_number FROM public.guest_checkouts
  ) t;

  IF v_dupes > 0 THEN
    RAISE EXCEPTION 'Номера пересекаются в % случаях', v_dupes;
  END IF;

  RAISE NOTICE '✅ Номер заказа теперь цифровой';
END $$;

NOTIFY pgrst, 'reload schema';
