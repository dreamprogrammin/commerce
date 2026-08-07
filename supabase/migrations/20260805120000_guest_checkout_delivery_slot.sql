-- ============================================================================
-- create_guest_checkout: принимает желаемые дату и интервал доставки
-- ============================================================================
-- Продолжение 20260805110000: колонки заведены, теперь их наполняет гостевая
-- ветка оформления. Тело функции перенесено из 20260805100000 без изменений,
-- добавлены только два параметра и две колонки в INSERT.
--
-- DROP снова обязателен: параметры с DEFAULT создают перегрузку, и вызов с
-- прежним набором аргументов подошёл бы обеим версиям — PostgREST ответил бы
-- «function is not unique».
--
-- create_user_order здесь намеренно не трогается: её фактическое определение
-- в проде расходится с каталогом миграций (у прода order_items.price_at_purchase,
-- локально price_per_item), и пересоздавать её можно только по prosrc с прода.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC, TEXT);

CREATE FUNCTION public.create_guest_checkout(
  p_cart_items      JSONB,
  p_guest_info      JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB DEFAULT NULL,
  p_payment_method  TEXT  DEFAULT NULL,
  p_promo_code      TEXT  DEFAULT NULL,
  p_delivery_cost   NUMERIC DEFAULT 0,
  p_comment         TEXT  DEFAULT NULL,
  p_delivery_date   DATE  DEFAULT NULL,
  p_delivery_slot   TEXT  DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
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

COMMENT ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT) IS
  'Создает гостевой заказ в guest_checkouts с резервированием товара. p_comment — комментарий к адресу; p_delivery_date и p_delivery_slot — желаемые дата и интервал. Всё попадает в guest_checkouts и в уведомление Telegram.';

GRANT EXECUTE ON FUNCTION public.create_guest_checkout(JSONB, JSONB, TEXT, JSONB, TEXT, TEXT, NUMERIC, TEXT, DATE, TEXT) TO anon, authenticated;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
