-- ============================================================================
-- МИГРАЦИЯ: Оффлайн продажи (POS-касса)
-- ============================================================================

-- 1. Добавляем поле source в orders и guest_checkouts
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'
  CHECK (source IN ('online', 'offline'));

ALTER TABLE public.guest_checkouts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'online'
  CHECK (source IN ('online', 'offline'));

-- 2. Поиск товаров для POS-кассы (по названию или штрихкоду)
CREATE OR REPLACE FUNCTION public.search_products_for_pos(p_query TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  price NUMERIC,
  stock_quantity INTEGER,
  bonus_points_award INTEGER,
  barcode TEXT,
  image_url TEXT,
  blur_placeholder TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.price,
    p.stock_quantity,
    COALESCE(p.bonus_points_award, 0) AS bonus_points_award,
    p.barcode,
    pi.image_url,
    pi.blur_placeholder
  FROM public.products p
  LEFT JOIN LATERAL (
    SELECT pi2.image_url, pi2.blur_placeholder
    FROM public.product_images pi2
    WHERE pi2.product_id = p.id
    ORDER BY pi2.display_order ASC
    LIMIT 1
  ) pi ON TRUE
  WHERE
    p.is_active = TRUE
    AND p.stock_quantity > 0
    AND (
      p.name ILIKE '%' || p_query || '%'
      OR p.barcode = p_query
    )
  ORDER BY
    CASE WHEN p.barcode = p_query THEN 0 ELSE 1 END,
    p.name ASC
  LIMIT 30;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_products_for_pos(TEXT) TO authenticated;

-- 3. Поиск профиля по номеру телефона
CREATE OR REPLACE FUNCTION public.get_profile_by_phone(p_phone TEXT)
RETURNS TABLE (
  id UUID,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  active_bonus_balance NUMERIC,
  pending_bonus_balance NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.first_name,
    pr.last_name,
    pr.phone,
    pr.active_bonus_balance,
    pr.pending_bonus_balance
  FROM public.profiles pr
  WHERE pr.phone = p_phone
  LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_by_phone(TEXT) TO authenticated;

-- 4. Создание оффлайн-продажи
-- Если p_profile_id передан → создает запись в orders (с бонусами)
-- Если p_profile_id не передан → создает запись в guest_checkouts (без бонусов)
CREATE OR REPLACE FUNCTION public.create_offline_sale(
  p_cart_items JSONB,
  p_payment_method TEXT DEFAULT 'cash',
  p_profile_id UUID DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_caller_role TEXT;
  v_profile RECORD;
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
BEGIN
  -- Проверяем что вызывает администратор
  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller_id;
  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: только администраторы могут создавать оффлайн-продажи';
  END IF;

  -- Проверяем наличие товаров и считаем сумму
  FOR v_cart_item IN
    SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
  LOOP
    SELECT id, price, stock_quantity, bonus_points_award, is_active
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

    SELECT * INTO v_profile FROM public.profiles WHERE id = p_profile_id;
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

    -- Создаём заказ
    INSERT INTO public.orders (
      user_id, total_amount, discount_amount, final_amount,
      bonuses_spent, bonuses_awarded,
      delivery_method, payment_method, status, source
    )
    VALUES (
      p_profile_id,
      v_total_price,
      v_calculated_discount,
      v_final_price,
      p_bonuses_to_spend,
      v_total_bonus_award,
      'pickup',
      p_payment_method,
      'new',
      'offline'
    )
    RETURNING id INTO v_order_id;

    -- Добавляем позиции
    FOR v_cart_item IN
      SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER)
    LOOP
      SELECT price, bonus_points_award INTO v_product FROM public.products WHERE id = v_cart_item.product_id;

      INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
      VALUES (
        v_order_id,
        v_cart_item.product_id,
        v_cart_item.quantity,
        v_product.price,
        COALESCE(v_product.bonus_points_award, 0)
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
      WHERE id = p_profile_id;
    END IF;

    -- Начисляем 1000 приветственных бонусов за первый заказ
    IF v_is_first_order AND NOT COALESCE(v_profile.has_received_welcome_bonus, FALSE) THEN
      UPDATE public.profiles
      SET active_bonus_balance = active_bonus_balance + 1000,
          has_received_welcome_bonus = TRUE
      WHERE id = p_profile_id;
    END IF;

    -- Бонусы с товаров → в pending (активируются через 14 дней)
    IF v_total_bonus_award > 0 THEN
      UPDATE public.profiles
      SET pending_bonus_balance = pending_bonus_balance + v_total_bonus_award
      WHERE id = p_profile_id;
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
      SELECT price INTO v_product FROM public.products WHERE id = v_cart_item.product_id;

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
$$;

GRANT EXECUTE ON FUNCTION public.create_offline_sale(JSONB, TEXT, UUID, INTEGER) TO authenticated;
