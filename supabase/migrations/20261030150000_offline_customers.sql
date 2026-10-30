-- ============================================================================
-- Карточки покупателей магазина (офлайн) и их слияние с аккаунтом сайта.
--
-- Зачем (30 октября 2026). Владелец: «нужна связь между заказами и продажами
-- офлайн». Решения владельца:
--   * покупатель без аккаунта — карточка по телефону: касса заводит её сама,
--     покупки и бонусы копятся на ней по тем же правилам, что у аккаунта;
--   * слияние с аккаунтом — КНОПКОЙ администратора, не автоматически: телефон
--     в профиле сайта покупатель вписывает сам и никто его не подтверждает,
--     автоматика отдала бы чужие бонусы любому, кто впишет чужой номер.
--
-- Почему отдельная таблица, а не профиль: `profiles.id` ссылается на
-- `auth.users` — профиля без учётной записи не бывает.
--
-- Что меняется:
--   1. `offline_customers` + `orders.offline_customer_id` и
--      `bonus_transactions.offline_customer_id`. У заказа карточки `user_id`
--      пуст: витрина, уведомления и триггеры заказов его не видят.
--   2. `pos_find_offline_customer`, `create_offline_customer` — для кассы
--      (браузер администратора, проверка роли внутри).
--   3. `create_offline_sale` — параметр `p_offline_customer_id DEFAULT NULL`,
--      старая сигнатура сносится явно. Касса на master шлёт прежние четыре
--      параметра — подходят к новой сигнатуре.
--   4. `activate_offline_customer_bonuses` + ежедневный cron — бонусы карточки
--      через 14 дней. `activate_pending_bonuses` не трогается: заказы карточки
--      без `user_id` он и так пропускает.
--   5. `admin_merge_offline_customer`, `admin_add_offline_customer_bonus` —
--      только ключу сервиса (маршруты админки после `requireAdmin`).
--
-- Сгорание (`expire_bonuses`) берёт строки с `expires_at`; строки карточки
-- его не ставят — как и строки кассы у аккаунтов.
-- ============================================================================

-- ── 0. Состояние базы ───────────────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.offline_customers') IS NOT NULL THEN
    RAISE EXCEPTION 'offline_customers уже есть — миграция применялась?';
  END IF;
  IF (SELECT md5(pg_get_functiondef(
        'public.create_offline_sale(jsonb, text, uuid, integer)'::regprocedure)))
       IS DISTINCT FROM 'ad3a7ade097025de5ae80e76f9cd591a' THEN
    RAISE EXCEPTION 'create_offline_sale отличается от снятой с прода 30.10.2026 — миграция не для этой базы';
  END IF;
  IF to_regnamespace('cron') IS NULL THEN
    RAISE EXCEPTION 'нет pg_cron — активации бонусов карточек не будет';
  END IF;
END $$;

-- ── 1. Номер телефона к одному виду ─────────────────────────────────────────
-- «8 702…», «+7 (702)…», «702…» → 7XXXXXXXXXX; что не номер — NULL
CREATE FUNCTION public.kz_phone_digits(p_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN d ~ '^[78]\d{10}$' THEN '7' || substr(d, 2)
    WHEN d ~ '^\d{10}$' THEN '7' || d
  END
  FROM (SELECT regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g') AS d) s
$function$;

-- ── 2. Таблица карточек ─────────────────────────────────────────────────────
CREATE TABLE public.offline_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name text NOT NULL CHECK (length(btrim(first_name)) > 0),
  last_name text,
  phone text NOT NULL,
  phone_digits text NOT NULL CHECK (phone_digits ~ '^7\d{10}$'),
  active_bonus_balance integer NOT NULL DEFAULT 0 CHECK (active_bonus_balance >= 0),
  pending_bonus_balance integer NOT NULL DEFAULT 0 CHECK (pending_bonus_balance >= 0),
  has_received_welcome_bonus boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Слияние: в какой аккаунт ушли покупки и бонусы, когда и кто нажал
  merged_into uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  merged_at timestamptz,
  merged_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.offline_customers IS
  'Покупатели магазина без аккаунта на сайте (касса, 30.10.2026). Сливаются с аккаунтом кнопкой администратора.';

-- Одна живая карточка на номер; объединённые остаются для истории
CREATE UNIQUE INDEX offline_customers_phone_live_idx
  ON public.offline_customers (phone_digits) WHERE merged_at IS NULL;

ALTER TABLE public.offline_customers ENABLE ROW LEVEL SECURITY;

-- Читает только администратор; пишут функции ниже
CREATE POLICY "offline_customers_admin_select" ON public.offline_customers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

REVOKE ALL ON public.offline_customers FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.offline_customers FROM authenticated;

ALTER TABLE public.orders
  ADD COLUMN offline_customer_id uuid REFERENCES public.offline_customers(id) ON DELETE RESTRICT;

-- Заказ карточки живёт без аккаунта до слияния. Прежнее правило «у заказа
-- есть хозяин» остаётся проверкой: аккаунт или карточка. Функции продаж и
-- возвратов (get_sales_list, get_sale_receipt, search_orders_for_return,
-- get_order_for_return) присоединяют профиль через LEFT JOIN — пустой
-- user_id переживают; RLS «свои заказы» (auth.uid() = user_id) его не видит.
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.orders ADD CONSTRAINT orders_owner_check
  CHECK (user_id IS NOT NULL OR offline_customer_id IS NOT NULL);

CREATE INDEX orders_offline_customer_id_idx ON public.orders (offline_customer_id)
  WHERE offline_customer_id IS NOT NULL;

ALTER TABLE public.bonus_transactions
  ADD COLUMN offline_customer_id uuid REFERENCES public.offline_customers(id) ON DELETE CASCADE;
CREATE INDEX bonus_transactions_offline_customer_id_idx ON public.bonus_transactions (offline_customer_id)
  WHERE offline_customer_id IS NOT NULL;

-- ── 3. Касса: найти и завести карточку ──────────────────────────────────────
CREATE FUNCTION public.pos_find_offline_customer(p_phone text)
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, active_bonus_balance integer, pending_bonus_balance integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы ищут покупателей по телефону';
  END IF;

  RETURN QUERY
  SELECT c.id, c.first_name, c.last_name, c.phone, c.active_bonus_balance, c.pending_bonus_balance
  FROM public.offline_customers c
  WHERE c.phone_digits = public.kz_phone_digits(p_phone)
    AND c.merged_at IS NULL;
END;
$function$;

CREATE FUNCTION public.create_offline_customer(p_first_name text, p_last_name text, p_phone text)
 RETURNS TABLE(id uuid, first_name text, last_name text, phone text, active_bonus_balance integer, pending_bonus_balance integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_digits text := public.kz_phone_digits(p_phone);
BEGIN
  IF (SELECT role FROM public.profiles WHERE profiles.id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: карточки заводит только администратор';
  END IF;
  IF length(btrim(COALESCE(p_first_name, ''))) = 0 THEN
    RAISE EXCEPTION 'Укажите имя покупателя';
  END IF;
  IF v_digits IS NULL THEN
    RAISE EXCEPTION 'Телефон не похож на номер: нужно 10 или 11 цифр';
  END IF;
  IF EXISTS (SELECT 1 FROM public.offline_customers c WHERE c.phone_digits = v_digits AND c.merged_at IS NULL) THEN
    RAISE EXCEPTION 'Карточка с этим номером уже есть';
  END IF;

  RETURN QUERY
  INSERT INTO public.offline_customers (first_name, last_name, phone, phone_digits, created_by)
  VALUES (
    btrim(p_first_name),
    NULLIF(btrim(COALESCE(p_last_name, '')), ''),
    '+7 (' || substr(v_digits, 2, 3) || ') ' || substr(v_digits, 5, 3) || '-'
      || substr(v_digits, 8, 2) || '-' || substr(v_digits, 10, 2),
    v_digits,
    auth.uid()
  )
  RETURNING offline_customers.id, offline_customers.first_name, offline_customers.last_name,
            offline_customers.phone, offline_customers.active_bonus_balance, offline_customers.pending_bonus_balance;
END;
$function$;

REVOKE ALL ON FUNCTION public.pos_find_offline_customer(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_offline_customer(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_find_offline_customer(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_offline_customer(text, text, text) TO authenticated, service_role;

-- ── 4. Продажа: на аккаунт, на карточку или анонимно ────────────────────────
-- Тело снято с прода 30.10.2026 (pg_get_functiondef), добавлена ветка карточки
DROP FUNCTION public.create_offline_sale(jsonb, text, uuid, integer);

CREATE FUNCTION public.create_offline_sale(p_cart_items jsonb, p_payment_method text DEFAULT 'cash'::text, p_profile_id uuid DEFAULT NULL::uuid, p_bonuses_to_spend integer DEFAULT 0, p_offline_customer_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_profile RECORD;
  v_card RECORD;
  v_cart_item RECORD;
  v_product RECORD;
  v_total_price NUMERIC := 0;
  v_total_bonus_award INTEGER := 0;
  v_calculated_discount NUMERIC := 0;
  v_final_price NUMERIC;
  v_bonus_rate NUMERIC;
  v_order_id UUID;
  v_checkout_id UUID;
  v_is_first_order BOOLEAN;
  v_active INTEGER;
  v_pending INTEGER;
BEGIN
  -- Проверяем что вызывает администратор
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы могут создавать оффлайн-продажи';
  END IF;

  IF p_profile_id IS NOT NULL AND p_offline_customer_id IS NOT NULL THEN
    RAISE EXCEPTION 'Продажа либо на аккаунт, либо на карточку магазина — не на оба';
  END IF;

  -- Проверяем наличие товаров и считаем сумму
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT id, COALESCE(final_price, price) AS price, stock_quantity, bonus_points_award, is_active
    INTO v_product
    FROM public.products
    WHERE id = v_cart_item.product_id;

    IF v_product IS NULL OR NOT v_product.is_active THEN
      RAISE EXCEPTION 'Товар не найден или неактивен: %', v_cart_item.product_id;
    END IF;

    IF v_product.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе. Доступно: % шт.', v_product.stock_quantity;
    END IF;

    v_total_price := v_total_price + (v_product.price * v_cart_item.quantity);
    v_total_bonus_award := v_total_bonus_award
      + (COALESCE(v_product.bonus_points_award, 0) * v_cart_item.quantity);
  END LOOP;

  -- === ПРОДАЖА С ЗАРЕГИСТРИРОВАННЫМ КЛИЕНТОМ ===
  IF p_profile_id IS NOT NULL THEN

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
    IF v_profile IS NULL THEN
      RAISE EXCEPTION 'Профиль клиента не найден';
    END IF;

    -- Проверяем и применяем бонусы
    IF p_bonuses_to_spend > 0 THEN
      IF v_profile.active_bonus_balance < p_bonuses_to_spend THEN
        RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %', v_profile.active_bonus_balance;
      END IF;

      SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
      INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

      v_calculated_discount := p_bonuses_to_spend * COALESCE(v_bonus_rate, 1.0);
    END IF;

    v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

    -- Проверяем первый ли заказ у клиента
    SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE user_id = p_profile_id)
    INTO v_is_first_order;

    -- Создаём заказ. Оплачен на месте — сразу `completed`; дата активации
    -- бонусов — как у заказа с сайта, через 14 дней
    INSERT INTO public.orders (
      user_id, total_amount, discount_amount, final_amount,
      bonuses_spent, bonuses_awarded, bonuses_activation_date,
      delivery_method, payment_method, status, source
    )
    VALUES (
      p_profile_id,
      v_total_price,
      v_calculated_discount,
      v_final_price,
      p_bonuses_to_spend,
      v_total_bonus_award,
      NOW() + INTERVAL '14 days',
      'pickup',
      p_payment_method,
      'completed',
      'offline'
    )
    RETURNING id INTO v_order_id;

    -- Добавляем позиции
    FOR v_cart_item IN
      SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
      SELECT COALESCE(final_price, price) AS price INTO v_product FROM public.products WHERE id = v_cart_item.product_id;

      INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase)
      VALUES (
        v_order_id,
        v_cart_item.product_id,
        v_cart_item.quantity,
        v_product.price
      );

      -- Списываем остаток
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_cart_item.quantity
      WHERE id = v_cart_item.product_id;
    END LOOP;

    -- Списываем потраченные бонусы
    IF p_bonuses_to_spend > 0 THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance - p_bonuses_to_spend
      WHERE id = p_profile_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

      INSERT INTO public.bonus_transactions (
        profile_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        p_profile_id, v_order_id, 'spent', -p_bonuses_to_spend,
        v_active, v_pending, 'Списание бонусов за покупку в магазине', 'completed'
      );
    END IF;

    -- Начисляем 1000 приветственных бонусов за первый заказ
    IF v_is_first_order AND NOT COALESCE(v_profile.has_received_welcome_bonus, FALSE) THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + 1000,
          has_received_welcome_bonus = TRUE
      WHERE id = p_profile_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

      INSERT INTO public.bonus_transactions (
        profile_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        p_profile_id, v_order_id, 'welcome', 1000,
        v_active, v_pending, 'Приветственные бонусы за первую покупку', 'completed'
      );
    END IF;

    -- Бонусы с товаров → в pending (активируются через 14 дней)
    IF v_total_bonus_award > 0 THEN
      UPDATE public.profiles
      SET pending_bonus_balance = pending_bonus_balance + v_total_bonus_award
      WHERE id = p_profile_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

      INSERT INTO public.bonus_transactions (
        profile_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, activation_date
      ) VALUES (
        p_profile_id, v_order_id, 'pending', v_total_bonus_award,
        v_active, v_pending, 'Начисление бонусов за покупку в магазине (ожидание активации)',
        NOW() + INTERVAL '14 days'
      );
    END IF;

    RETURN jsonb_build_object(
      'order_id', v_order_id,
      'type', 'user_order',
      'total', v_total_price,
      'discount', v_calculated_discount,
      'final', v_final_price,
      'bonuses_spent', p_bonuses_to_spend,
      'bonuses_awarded', v_total_bonus_award
    );

  -- === КАРТОЧКА МАГАЗИНА (30.10.2026) ===
  -- Те же правила, что у аккаунта: бонусы копятся на карточке и ждут 14 дней
  -- (activate_offline_customer_bonuses), приветственные — за первую покупку.
  -- user_id в заказе пуст до слияния карточки с аккаунтом.
  ELSIF p_offline_customer_id IS NOT NULL THEN

    SELECT * INTO v_card FROM public.offline_customers WHERE id = p_offline_customer_id FOR UPDATE;
    IF v_card IS NULL OR v_card.merged_at IS NOT NULL THEN
      RAISE EXCEPTION 'Карточка покупателя не найдена или уже объединена с аккаунтом';
    END IF;

    IF p_bonuses_to_spend > 0 THEN
      IF v_card.active_bonus_balance < p_bonuses_to_spend THEN
        RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %', v_card.active_bonus_balance;
      END IF;
      SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
      INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';
      v_calculated_discount := p_bonuses_to_spend * COALESCE(v_bonus_rate, 1.0);
    END IF;
    v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

    SELECT NOT EXISTS(SELECT 1 FROM public.orders WHERE offline_customer_id = p_offline_customer_id)
    INTO v_is_first_order;

    INSERT INTO public.orders (
      user_id, offline_customer_id, total_amount, discount_amount, final_amount,
      bonuses_spent, bonuses_awarded, bonuses_activation_date,
      delivery_method, payment_method, status, source
    )
    VALUES (
      NULL, p_offline_customer_id, v_total_price, v_calculated_discount, v_final_price,
      p_bonuses_to_spend, v_total_bonus_award, NOW() + INTERVAL '14 days',
      'pickup', p_payment_method, 'completed', 'offline'
    )
    RETURNING id INTO v_order_id;

    FOR v_cart_item IN
      SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
      SELECT COALESCE(final_price, price) AS price INTO v_product FROM public.products WHERE id = v_cart_item.product_id;
      INSERT INTO public.order_items (order_id, product_id, quantity, price_at_purchase)
      VALUES (v_order_id, v_cart_item.product_id, v_cart_item.quantity, v_product.price);
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_cart_item.quantity
      WHERE id = v_cart_item.product_id;
    END LOOP;

    IF p_bonuses_to_spend > 0 THEN
      UPDATE public.offline_customers
      SET active_bonus_balance = active_bonus_balance - p_bonuses_to_spend
      WHERE id = p_offline_customer_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;
      INSERT INTO public.bonus_transactions (
        offline_customer_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        p_offline_customer_id, v_order_id, 'spent', -p_bonuses_to_spend,
        v_active, v_pending, 'Списание бонусов за покупку в магазине', 'completed'
      );
    END IF;

    IF v_is_first_order AND NOT v_card.has_received_welcome_bonus THEN
      UPDATE public.offline_customers
      SET active_bonus_balance = active_bonus_balance + 1000,
          has_received_welcome_bonus = TRUE
      WHERE id = p_offline_customer_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;
      INSERT INTO public.bonus_transactions (
        offline_customer_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, status
      ) VALUES (
        p_offline_customer_id, v_order_id, 'welcome', 1000,
        v_active, v_pending, 'Приветственные бонусы за первую покупку', 'completed'
      );
    END IF;

    IF v_total_bonus_award > 0 THEN
      UPDATE public.offline_customers
      SET pending_bonus_balance = pending_bonus_balance + v_total_bonus_award
      WHERE id = p_offline_customer_id
      RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;
      INSERT INTO public.bonus_transactions (
        offline_customer_id, order_id, transaction_type, amount,
        balance_after, pending_balance_after, description, activation_date
      ) VALUES (
        p_offline_customer_id, v_order_id, 'pending', v_total_bonus_award,
        v_active, v_pending, 'Начисление бонусов за покупку в магазине (ожидание активации)',
        NOW() + INTERVAL '14 days'
      );
    END IF;

    RETURN jsonb_build_object(
      'order_id', v_order_id,
      'type', 'offline_customer_order',
      'total', v_total_price,
      'discount', v_calculated_discount,
      'final', v_final_price,
      'bonuses_spent', p_bonuses_to_spend,
      'bonuses_awarded', v_total_bonus_award
    );

  -- === АНОНИМНАЯ ПРОДАЖА (без клиента) ===
  ELSE

    v_final_price := v_total_price;

    INSERT INTO public.guest_checkouts (
      guest_name, guest_email, guest_phone,
      total_amount, final_amount,
      delivery_method, payment_method, status, source
    )
    VALUES (
      'Оффлайн покупатель', 'offline@uhti.kz', '',
      v_total_price, v_final_price,
      'pickup', p_payment_method, 'new', 'offline'
    )
    RETURNING id INTO v_checkout_id;

    -- Добавляем позиции
    FOR v_cart_item IN
      SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
      SELECT COALESCE(final_price, price) AS price INTO v_product FROM public.products WHERE id = v_cart_item.product_id;

      INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
      VALUES (v_checkout_id, v_cart_item.product_id, v_cart_item.quantity, v_product.price);

      -- Списываем остаток
      UPDATE public.products
      SET stock_quantity = stock_quantity - v_cart_item.quantity
      WHERE id = v_cart_item.product_id;
    END LOOP;

    RETURN jsonb_build_object(
      'order_id', v_checkout_id,
      'type', 'guest_checkout',
      'total', v_total_price,
      'discount', 0,
      'final', v_final_price,
      'bonuses_spent', 0,
      'bonuses_awarded', 0
    );

  END IF;
END;
$function$;

-- Права — как у прежней: зовёт касса в браузере администратора
GRANT EXECUTE ON FUNCTION public.create_offline_sale(jsonb, text, uuid, integer, uuid) TO anon, authenticated, service_role;

-- ── 5. Активация бонусов карточек через 14 дней ─────────────────────────────
-- Повторяет первый цикл activate_pending_bonuses для заказов без аккаунта
CREATE FUNCTION public.activate_offline_customer_bonuses()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row RECORD;
  v_active integer;
  v_pending integer;
  v_orders integer := 0;
  v_total integer := 0;
BEGIN
  FOR v_row IN
    SELECT o.id, o.offline_customer_id, o.bonuses_awarded
    FROM public.orders o
    JOIN public.offline_customers c ON c.id = o.offline_customer_id
    WHERE o.user_id IS NULL
      AND c.merged_at IS NULL
      AND o.status IN ('confirmed', 'shipped', 'delivered', 'completed')
      AND o.bonuses_activation_date IS NOT NULL
      AND o.bonuses_activation_date <= now()
      AND o.bonuses_awarded > 0
      AND c.pending_bonus_balance >= o.bonuses_awarded
      AND NOT EXISTS (
        SELECT 1 FROM public.bonus_transactions bt
        WHERE bt.order_id = o.id AND bt.transaction_type = 'activation'
      )
    ORDER BY o.bonuses_activation_date
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.offline_customers
    SET pending_bonus_balance = pending_bonus_balance - v_row.bonuses_awarded,
        active_bonus_balance = active_bonus_balance + v_row.bonuses_awarded
    WHERE id = v_row.offline_customer_id
    RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;

    INSERT INTO public.bonus_transactions (
      offline_customer_id, order_id, transaction_type, amount,
      balance_after, pending_balance_after, description, status
    ) VALUES (
      v_row.offline_customer_id, v_row.id, 'activation', v_row.bonuses_awarded,
      v_active, v_pending, 'Активация бонусов за заказ (14 дней)', 'completed'
    );

    v_orders := v_orders + 1;
    v_total := v_total + v_row.bonuses_awarded;
  END LOOP;

  RETURN format('Карточки магазина: заказов %s, активировано %s бонусов.', v_orders, v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.activate_offline_customer_bonuses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_offline_customer_bonuses() TO service_role;

-- Через пять минут после активации аккаунтов
SELECT cron.schedule(
  'Offline Customer Bonus Activation',
  '5 2 * * *',
  'SELECT public.activate_offline_customer_bonuses();'
);

-- ── 6. Слияние карточки с аккаунтом — кнопкой администратора ────────────────
CREATE FUNCTION public.admin_merge_offline_customer(p_customer_id uuid, p_profile_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card RECORD;
  v_orders integer;
  v_active integer;
  v_pending integer;
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = p_admin_id) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Объединять может только администратор';
  END IF;

  SELECT * INTO v_card FROM public.offline_customers WHERE id = p_customer_id FOR UPDATE;
  IF v_card IS NULL THEN
    RAISE EXCEPTION 'Карточка не найдена';
  END IF;
  IF v_card.merged_at IS NOT NULL THEN
    RAISE EXCEPTION 'Карточка уже объединена с аккаунтом';
  END IF;

  -- Профиль под блокировкой: баланс меняется вместе с переносом строк
  UPDATE public.profiles
  SET active_bonus_balance = active_bonus_balance + v_card.active_bonus_balance,
      pending_bonus_balance = pending_bonus_balance + v_card.pending_bonus_balance,
      has_received_welcome_bonus = has_received_welcome_bonus OR v_card.has_received_welcome_bonus,
      phone = COALESCE(NULLIF(btrim(phone), ''), v_card.phone),
      first_name = COALESCE(NULLIF(btrim(first_name), ''), v_card.first_name),
      last_name = COALESCE(NULLIF(btrim(last_name), ''), v_card.last_name),
      updated_at = now()
  WHERE id = p_profile_id
  RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Аккаунт не найден';
  END IF;

  -- Заказы и история переходят в аккаунт; ссылка на карточку остаётся —
  -- видно, что покупка была до слияния. Ожидающие бонусы дальше активирует
  -- activate_pending_bonuses, как у заказов с сайта.
  UPDATE public.orders SET user_id = p_profile_id
  WHERE offline_customer_id = p_customer_id AND user_id IS NULL;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  UPDATE public.bonus_transactions SET user_id = p_profile_id, profile_id = p_profile_id
  WHERE offline_customer_id = p_customer_id AND user_id IS NULL;

  UPDATE public.offline_customers
  SET merged_into = p_profile_id, merged_at = now(), merged_by = p_admin_id,
      active_bonus_balance = 0, pending_bonus_balance = 0
  WHERE id = p_customer_id;

  IF v_card.active_bonus_balance + v_card.pending_bonus_balance > 0 OR v_orders > 0 THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (
      p_profile_id, 'bonus_earned', 'Покупки из магазина в вашем аккаунте',
      format('Перенесено покупок: %s, бонусов: %s', v_orders,
             v_card.active_bonus_balance + v_card.pending_bonus_balance),
      '/profile/bonuses'
    );
  END IF;

  RETURN jsonb_build_object(
    'orders', v_orders,
    'active_moved', v_card.active_bonus_balance,
    'pending_moved', v_card.pending_bonus_balance,
    'active_balance', v_active,
    'pending_balance', v_pending
  );
END;
$function$;

-- ── 7. Ручное начисление на карточку (как admin_add_bonus для аккаунта) ─────
CREATE FUNCTION public.admin_add_offline_customer_bonus(
  p_customer_id uuid,
  p_amount integer,
  p_reason text,
  p_admin_id uuid,
  p_order_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin RECORD;
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_active integer;
  v_pending integer;
  v_tx_id uuid;
BEGIN
  SELECT id, role, first_name, last_name INTO v_admin FROM public.profiles WHERE id = p_admin_id;
  IF v_admin.role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Начислять бонусы может только администратор';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 100000 THEN
    RAISE EXCEPTION 'Сумма бонусов — от 1 до 100 000';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Укажите причину начисления';
  END IF;
  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders WHERE id = p_order_id AND offline_customer_id = p_customer_id AND user_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Заказ не принадлежит этому покупателю';
  END IF;

  UPDATE public.offline_customers
  SET active_bonus_balance = active_bonus_balance + p_amount
  WHERE id = p_customer_id AND merged_at IS NULL
  RETURNING active_bonus_balance, pending_bonus_balance INTO v_active, v_pending;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Карточка не найдена или уже объединена с аккаунтом';
  END IF;

  INSERT INTO public.bonus_transactions (
    offline_customer_id, order_id, transaction_type, amount,
    balance_after, pending_balance_after, description, status, metadata
  ) VALUES (
    p_customer_id, p_order_id, 'manual', p_amount,
    v_active, v_pending, v_reason, 'completed',
    jsonb_build_object(
      'admin_id', v_admin.id,
      'admin_name', NULLIF(btrim(concat_ws(' ', v_admin.first_name, v_admin.last_name)), '')
    )
  )
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('transaction_id', v_tx_id, 'amount', p_amount, 'active_balance', v_active);
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_merge_offline_customer(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_add_offline_customer_bonus(uuid, integer, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_merge_offline_customer(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_offline_customer_bonus(uuid, integer, text, uuid, uuid) TO service_role;

-- ── 8. По одной версии каждой функции ───────────────────────────────────────
DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['kz_phone_digits', 'pos_find_offline_customer', 'create_offline_customer',
    'create_offline_sale', 'activate_offline_customer_bonuses', 'admin_merge_offline_customer',
    'admin_add_offline_customer_bonus']
  LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = v_name) <> 1 THEN
      RAISE EXCEPTION '% — не одна версия', v_name;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM cron.job WHERE jobname = 'Offline Customer Bonus Activation') <> 1 THEN
    RAISE EXCEPTION 'нет задачи cron для активации бонусов карточек';
  END IF;
END $$;
