-- ============================================================================
--  Промокод наконец применяется к заказу
-- ============================================================================
--  ЧТО БЫЛО. Промокоды живут в promo_codes, и по ней же их проверяет
--  validate_promo_code, которую вызывает фронт перед оформлением. А обе
--  функции создания заказа обращались к promo_campaigns — другой таблице,
--  про маркетинговые акции, где колонки code нет вовсе. Итог:
--    • у авторизованного заказ падал с «column code does not exist»;
--    • у гостя p_promo_code принимался и не использовался ни разу —
--      покупателю показывали скидку, а записывали полную сумму.
--
--  ЧТО СТАЛО. Появилась redeem_promo_code: она повторяет проверки
--  validate_promo_code, но вдобавок фиксирует использование кода. Скидка
--  считается на сервере от фактической суммы корзины — значение с клиента
--  не принимается вовсе, иначе скидку можно было бы назначить себе самому.
--
--  НЕВАЛИДНЫЙ КОД РОНЯЕТ ЗАКАЗ, а не игнорируется молча. Покупатель видел
--  скидку на экране; списать больше показанного хуже, чем попросить убрать
--  код и оформить заново. Сообщение возвращается тем же текстом, что даёт
--  validate_promo_code, поэтому фронту не нужно ничего переводить.
--
--  ПОРЯДОК СКИДОК: сначала промокод, потом бонусы — бонусами можно закрыть
--  только остаток. Так же считает и макет.
--
--  УЧЁТ ИСПОЛЬЗОВАНИЙ. redeem_promo_code берёт строку кода FOR UPDATE и
--  увеличивает uses_count. Без этого код с max_uses = 1 можно было бы
--  применить сколько угодно раз: validate_promo_code только читает.
--
--  Тела create_user_order и create_guest_checkout сняты с прода через
--  pg_get_functiondef, изменены только места, связанные с промокодом.
-- ============================================================================

-- Куда записывать примененный код. Раньше в заказе не оставалось следа:
-- поддержка не могла понять, почему сумма ниже суммы позиций.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code     TEXT,
  ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(10, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS promo_code     TEXT,
  ADD COLUMN IF NOT EXISTS promo_discount NUMERIC(10, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.orders.promo_code IS 'Применённый промокод в верхнем регистре, NULL если не применялся';
COMMENT ON COLUMN public.orders.promo_discount IS 'Скидка по промокоду в тенге, посчитанная на сервере';

-- ---------------------------------------------------------------------------
--  Погашение промокода: те же проверки, что в validate_promo_code, плюс учёт
--  использования. Пустой код — не ошибка, просто нулевая скидка.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redeem_promo_code(
  p_code         TEXT,
  p_order_amount NUMERIC,
  p_user_id      UUID DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code  TEXT;
  v_promo public.promo_codes%ROWTYPE;
BEGIN
  v_code := NULLIF(UPPER(TRIM(COALESCE(p_code, ''))), '');

  IF v_code IS NULL THEN
    RETURN 0;
  END IF;

  -- FOR UPDATE: два параллельных заказа с одним кодом не должны оба пройти,
  -- если у кода остался один использование.
  SELECT * INTO v_promo
  FROM public.promo_codes
  WHERE code = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Промокод не найден';
  END IF;

  -- Именной код принадлежит конкретному покупателю. Для гостя p_user_id
  -- всегда NULL, поэтому именные коды ему недоступны — это намеренно.
  IF v_promo.user_id IS NOT NULL AND v_promo.user_id IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Промокод не найден';
  END IF;

  IF v_promo.expires_at < NOW() THEN
    RAISE EXCEPTION 'Промокод истёк';
  END IF;

  IF v_promo.max_uses IS NOT NULL AND COALESCE(v_promo.uses_count, 0) >= v_promo.max_uses THEN
    RAISE EXCEPTION 'Промокод уже использован';
  END IF;

  IF p_order_amount < COALESCE(v_promo.min_order_amount, 0) THEN
    RAISE EXCEPTION 'Минимальная сумма заказа: % ₸', v_promo.min_order_amount::INTEGER;
  END IF;

  UPDATE public.promo_codes
  SET uses_count = COALESCE(uses_count, 0) + 1,
      used_at    = COALESCE(used_at, NOW())
  WHERE id = v_promo.id;

  -- Округление то же, что у validate_promo_code, иначе показанная и списанная
  -- скидки разошлись бы на копейки.
  RETURN LEAST(
    ROUND(p_order_amount * v_promo.discount_percent / 100, 0),
    p_order_amount
  );
END;
$$;

COMMENT ON FUNCTION public.redeem_promo_code(TEXT, NUMERIC, UUID) IS
  'Проверяет промокод и фиксирует его использование. Возвращает скидку в тенге; пустой код даёт 0, невалидный — исключение.';

GRANT EXECUTE ON FUNCTION public.redeem_promo_code(TEXT, NUMERIC, UUID) TO anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.create_user_order(p_cart_items jsonb, p_delivery_method text, p_payment_method text DEFAULT NULL::text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_bonuses_to_spend integer DEFAULT 0, p_promo_code text DEFAULT NULL::text, p_contact_name text DEFAULT NULL::text, p_contact_phone text DEFAULT NULL::text, p_delivery_cost numeric DEFAULT 0, p_comment text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_delivery_slot text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_current_user_id     UUID    := auth.uid();
  v_user_profile        RECORD;
  v_new_order_id        UUID;
  v_total_price         NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price         NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_cart_item           RECORD;
  v_product_record      RECORD;
  v_bonus_rate          NUMERIC := 1.0;
  v_new_active_balance  INTEGER;
  v_new_pending_balance INTEGER;
  v_user_email          TEXT;
  v_user_name           TEXT;
  v_validated_items     JSONB   := '[]'::JSONB;
  v_promo_discount      NUMERIC := 0;
  v_contact_name        TEXT;
  v_contact_phone       TEXT;
  v_comment             TEXT;
  v_slot                TEXT;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация для оформления заказа';
  END IF;

  v_contact_name  := NULLIF(TRIM(COALESCE(p_contact_name,  '')), '');
  v_contact_phone := NULLIF(TRIM(COALESCE(p_contact_phone, '')), '');
  -- Пустые строки храним как NULL: уведомление печатает эти блоки
  -- по IS NOT NULL, иначе оператор получил бы пустые заголовки.
  v_comment       := NULLIF(TRIM(COALESCE(p_comment, '')), '');
  v_slot          := NULLIF(TRIM(COALESCE(p_delivery_slot, '')), '');

  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  IF v_user_profile IS NULL THEN
    SELECT email,
           COALESCE(
             raw_user_meta_data->>'first_name',
             raw_user_meta_data->>'full_name',
             raw_user_meta_data->>'name',
             split_part(email, '@', 1),
             'Гость'
           )
    INTO v_user_email, v_user_name
    FROM auth.users WHERE id = v_current_user_id;

    INSERT INTO public.profiles (
      id, first_name, active_bonus_balance, pending_bonus_balance, created_at, updated_at
    ) VALUES (
      v_current_user_id, v_user_name, 0, 0, NOW(), NOW()
    );

    SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;
  END IF;

  IF p_bonuses_to_spend > v_user_profile.active_bonus_balance THEN
    RAISE EXCEPTION 'Недостаточно бонусов. Доступно: %, запрошено: %',
      v_user_profile.active_bonus_balance, p_bonuses_to_spend;
  END IF;

  -- Промокод раньше искался в promo_campaigns по колонке code, которой у той
  -- таблицы нет вовсе, — заказ с кодом падал. Коды живут в promo_codes, и по
  -- ней же их проверяет validate_promo_code, которую вызывает фронт.
  -- Гасим код ниже, когда известна сумма корзины.

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(p_cart_items)
  LOOP
    SELECT * INTO v_product_record
    FROM public.products
    WHERE id = (v_cart_item.value->>'product_id')::UUID
      AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар % не найден или неактивен', v_cart_item.value->>'product_id';
    END IF;

    IF v_product_record.stock_quantity < (v_cart_item.value->>'quantity')::INTEGER THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе. Доступно: %, запрошено: %',
        v_product_record.name,
        v_product_record.stock_quantity,
        (v_cart_item.value->>'quantity')::INTEGER;
    END IF;

    UPDATE public.products
    SET stock_quantity = stock_quantity - (v_cart_item.value->>'quantity')::INTEGER,
        updated_at = NOW()
    WHERE id = v_product_record.id;

    v_total_price := v_total_price + (v_product_record.final_price * (v_cart_item.value->>'quantity')::INTEGER);
    v_total_award_bonuses := v_total_award_bonuses +
      (COALESCE(v_product_record.bonus_points_award, 0) * (v_cart_item.value->>'quantity')::INTEGER);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_product_record.id,
      'quantity', (v_cart_item.value->>'quantity')::INTEGER,
      'price', v_product_record.final_price
    );
  END LOOP;

  -- Скидку по промокоду считаем на сервере от фактической суммы корзины:
  -- значение с клиента не принимаем вовсе.
  v_promo_discount := public.redeem_promo_code(p_promo_code, v_total_price, v_current_user_id);

  -- Бонусами можно закрыть только то, что осталось после промокода.
  v_calculated_discount := LEAST(p_bonuses_to_spend, v_total_price - v_promo_discount);
  IF v_calculated_discount < 0 THEN
    v_calculated_discount := 0;
  END IF;

  v_final_price := v_total_price - v_promo_discount - v_calculated_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  v_total_award_bonuses := FLOOR(v_total_award_bonuses * v_bonus_rate);

  INSERT INTO public.orders (
    user_id,
    total_amount,
    discount_amount,
    promo_code,
    promo_discount,
    final_amount,
    delivery_method,
    delivery_address,
    payment_method,
    bonuses_spent,
    bonuses_awarded,
    bonuses_activation_date,
    status,
    source,
    customer_name,
    customer_phone,
    delivery_cost,
    comment,
    delivery_date,
    delivery_slot,
    created_at,
    updated_at
  ) VALUES (
    v_current_user_id,
    v_total_price,
    v_calculated_discount,
    NULLIF(UPPER(TRIM(COALESCE(p_promo_code, ''))), ''),
    v_promo_discount,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    p_bonuses_to_spend,
    v_total_award_bonuses,
    NOW() + INTERVAL '14 days',
    'new',
    'web',
    COALESCE(v_contact_name, v_user_profile.first_name),
    COALESCE(v_contact_phone, v_user_profile.phone),
    p_delivery_cost,
    v_comment,
    p_delivery_date,
    v_slot,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_order_id;

  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_id,
      quantity,
      price_at_purchase,
      created_at
    ) VALUES (
      v_new_order_id,
      (v_cart_item.value->>'product_id')::UUID,
      (v_cart_item.value->>'quantity')::INTEGER,
      (v_cart_item.value->>'price')::NUMERIC,
      NOW()
    );
  END LOOP;

  IF p_bonuses_to_spend > 0 THEN
    v_new_active_balance := v_user_profile.active_bonus_balance - p_bonuses_to_spend;

    UPDATE public.profiles
    SET active_bonus_balance = v_new_active_balance,
        updated_at = NOW()
    WHERE id = v_current_user_id;

    INSERT INTO public.bonus_transactions (
      profile_id,
      amount,
      transaction_type,
      description,
      order_id,
      created_at
    ) VALUES (
      v_current_user_id,
      -p_bonuses_to_spend,
      'spent',
      'Списание бонусов за заказ',
      v_new_order_id,
      NOW()
    );
  END IF;

  v_new_pending_balance := v_user_profile.pending_bonus_balance + v_total_award_bonuses;

  UPDATE public.profiles
  SET pending_bonus_balance = v_new_pending_balance,
      updated_at = NOW()
  WHERE id = v_current_user_id;

  INSERT INTO public.bonus_transactions (
    profile_id,
    amount,
    transaction_type,
    description,
    order_id,
    activation_date,
    created_at
  ) VALUES (
    v_current_user_id,
    v_total_award_bonuses,
    'pending',
    'Начисление бонусов за заказ (ожидание активации)',
    v_new_order_id,
    NOW() + INTERVAL '14 days',
    NOW()
  );

  RETURN v_new_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_guest_checkout(p_cart_items jsonb, p_guest_info jsonb, p_delivery_method text, p_delivery_address jsonb DEFAULT NULL::jsonb, p_payment_method text DEFAULT NULL::text, p_promo_code text DEFAULT NULL::text, p_delivery_cost numeric DEFAULT 0, p_comment text DEFAULT NULL::text, p_delivery_date date DEFAULT NULL::date, p_delivery_slot text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_new_order_id    UUID;
  v_total_price     NUMERIC := 0;
  v_promo_discount  NUMERIC := 0;
  v_final_price     NUMERIC;
  v_cart_item       RECORD;
  v_product_record  RECORD;
  v_validated_items JSONB   := '[]'::JSONB;
  v_comment         TEXT;
  v_slot            TEXT;
BEGIN
  -- Проверяем обязательные поля
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  -- Пустую строку храним как NULL: бот печатает блок «Комментарий» по
  -- IS NOT NULL, и пробелы из формы дали бы пустую строку в сообщении.
  v_comment := NULLIF(TRIM(COALESCE(p_comment, '')), '');
  v_slot    := NULLIF(TRIM(COALESCE(p_delivery_slot, '')), '');

  -- Валидация и резервирование товаров
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT final_price, stock_quantity, name
    INTO v_product_record
    FROM public.products
    WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден или недоступен (ID: %)', v_cart_item.product_id;
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара "%" на складе. Доступно: %, запрошено: %',
        v_product_record.name, v_product_record.stock_quantity, v_cart_item.quantity;
    END IF;

    -- Резервируем товар
    UPDATE public.products
    SET stock_quantity = stock_quantity - v_cart_item.quantity,
        updated_at = NOW()
    WHERE id = v_cart_item.product_id;

    v_total_price := v_total_price + (v_product_record.final_price * v_cart_item.quantity);

    v_validated_items := v_validated_items || jsonb_build_object(
      'product_id', v_cart_item.product_id,
      'quantity',   v_cart_item.quantity,
      'final_price', v_product_record.final_price
    );
  END LOOP;

  -- Скидку по промокоду считаем на сервере; p_promo_code раньше принимался
  -- и не использовался вовсе — покупателю показывали скидку, а списывали
  -- полную сумму. Гостю доступны только коды без привязки к пользователю.
  v_promo_discount := public.redeem_promo_code(p_promo_code, v_total_price, NULL);

  -- Рассчитываем финальную цену.
  -- v_promo_discount здесь всегда 0: p_promo_code принимается ради
  -- совместимости вызова, но скидка по нему не применялась и до этой
  -- миграции. Поведение сохранено без изменений намеренно — вопрос
  -- промокодов решается отдельно.
  v_final_price := v_total_price - v_promo_discount + p_delivery_cost;

  IF v_final_price < 0 THEN
    v_final_price := 0;
  END IF;

  INSERT INTO public.guest_checkouts (
    guest_name,
    guest_email,
    guest_phone,
    total_amount,
    final_amount,
    delivery_method,
    delivery_address,
    payment_method,
    status,
    source,
    delivery_cost,
    promo_code,
    promo_discount,
    comment,
    delivery_date,
    delivery_slot,
    created_at,
    updated_at
  ) VALUES (
    p_guest_info->>'name',
    p_guest_info->>'email',
    p_guest_info->>'phone',
    v_total_price,
    v_final_price,
    p_delivery_method,
    p_delivery_address,
    p_payment_method,
    'new',
    'online',
    p_delivery_cost,
    NULLIF(UPPER(TRIM(COALESCE(p_promo_code, ''))), ''),
    v_promo_discount,
    v_comment,
    p_delivery_date,
    v_slot,
    NOW(),
    NOW()
  ) RETURNING id INTO v_new_order_id;

  -- Создаем товары заказа в guest_checkout_items
  FOR v_cart_item IN SELECT * FROM jsonb_array_elements(v_validated_items)
  LOOP
    INSERT INTO public.guest_checkout_items (
      checkout_id,
      product_id,
      quantity,
      price_per_item,
      created_at
    ) VALUES (
      v_new_order_id,
      (v_cart_item.value->>'product_id')::UUID,
      (v_cart_item.value->>'quantity')::INTEGER,
      (v_cart_item.value->>'final_price')::NUMERIC,
      NOW()
    );
  END LOOP;

  RETURN v_new_order_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
