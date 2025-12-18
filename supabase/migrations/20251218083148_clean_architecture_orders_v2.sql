-- Шаг 1: Убираем constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS "orders_user_id_fkey";

-- Шаг 2: Создаем таблицу для гостевых заказов
CREATE TABLE IF NOT EXISTS public.guest_checkouts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  final_amount NUMERIC(10, 2) NOT NULL CHECK (final_amount >= 0),
  delivery_method TEXT NOT NULL,
  delivery_address JSONB,
  payment_method TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'shipped', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_guest_checkouts_email ON public.guest_checkouts(guest_email);
CREATE INDEX IF NOT EXISTS idx_guest_checkouts_status ON public.guest_checkouts(status);
CREATE INDEX IF NOT EXISTS idx_guest_checkouts_created_at ON public.guest_checkouts(created_at DESC);

-- Товары в гостевых заказах
CREATE TABLE IF NOT EXISTS public.guest_checkout_items (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  checkout_id UUID NOT NULL REFERENCES public.guest_checkouts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  price_per_item NUMERIC(10, 2) NOT NULL CHECK (price_per_item >= 0)
);

CREATE INDEX IF NOT EXISTS idx_guest_checkout_items_checkout_id ON public.guest_checkout_items(checkout_id);
CREATE INDEX IF NOT EXISTS idx_guest_checkout_items_product_id ON public.guest_checkout_items(product_id);

-- Шаг 3: Переносим гостевые заказы
INSERT INTO public.guest_checkouts (
  id, guest_name, guest_email, guest_phone,
  total_amount, final_amount, delivery_method, delivery_address,
  payment_method, status, created_at, updated_at, expires_at
)
SELECT 
  o.id,
  COALESCE(o.guest_name, 'Guest'),
  COALESCE(o.guest_email, 'unknown@guest.com'),
  COALESCE(o.guest_phone, 'N/A'),
  o.total_amount,
  o.final_amount,
  o.delivery_method,
  o.delivery_address,
  o.payment_method,
  o.status,
  o.created_at,
  o.updated_at,
  CASE WHEN o.status IN ('completed', 'cancelled') THEN o.updated_at + INTERVAL '90 days' ELSE NULL END
FROM public.orders o
WHERE o.user_id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Переносим товары
INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
SELECT oi.order_id, oi.product_id, oi.quantity, oi.price_per_item
FROM public.order_items oi
WHERE oi.order_id IN (SELECT id FROM public.orders WHERE user_id IS NULL)
ON CONFLICT DO NOTHING;

-- Удаляем гостевые заказы из orders
DELETE FROM public.orders WHERE user_id IS NULL;

-- Шаг 4: Делаем user_id NOT NULL
ALTER TABLE public.orders ALTER COLUMN user_id SET NOT NULL;

-- Добавляем constraint к profiles
ALTER TABLE public.orders ADD CONSTRAINT "orders_user_id_fkey" 
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Удаляем гостевые колонки
ALTER TABLE public.orders DROP COLUMN IF EXISTS guest_name;
ALTER TABLE public.orders DROP COLUMN IF EXISTS guest_email;
ALTER TABLE public.orders DROP COLUMN IF EXISTS guest_phone;

-- Шаг 5: Функция для гостевого заказа
CREATE OR REPLACE FUNCTION public.create_guest_checkout(
  p_cart_items JSONB,
  p_guest_info JSONB,
  p_delivery_method TEXT,
  p_delivery_address JSONB DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $function$
DECLARE
  v_new_checkout_id UUID;
  v_total_price NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
BEGIN
  IF p_guest_info->>'name' IS NULL OR p_guest_info->>'email' IS NULL OR p_guest_info->>'phone' IS NULL THEN
    RAISE EXCEPTION 'Необходимо указать имя, email и телефон';
  END IF;

  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, stock_quantity INTO v_product_record
    FROM public.products WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
  END LOOP;

  INSERT INTO public.guest_checkouts (
    guest_name, guest_email, guest_phone,
    total_amount, final_amount, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone',
    v_total_price, v_total_price, p_delivery_method, p_delivery_address, p_payment_method, 'new'
  )
  RETURNING id INTO v_new_checkout_id;

  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.guest_checkout_items (checkout_id, product_id, quantity, price_per_item)
    VALUES (v_new_checkout_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price);
  END LOOP;

  RETURN v_new_checkout_id;
END;
$function$;

-- Шаг 6: Функция для заказа пользователя
CREATE OR REPLACE FUNCTION public.create_user_order(
  p_cart_items JSONB,
  p_delivery_method TEXT,
  p_payment_method TEXT DEFAULT NULL,
  p_delivery_address JSONB DEFAULT NULL,
  p_bonuses_to_spend INTEGER DEFAULT 0
)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
AS $function$
DECLARE
  v_current_user_id UUID := auth.uid();
  v_user_profile RECORD;
  v_new_order_id UUID;
  v_total_price NUMERIC := 0;
  v_total_award_bonuses INTEGER := 0;
  v_final_price NUMERIC;
  v_calculated_discount NUMERIC := 0;
  v_cart_item RECORD;
  v_product_record RECORD;
  v_bonus_rate NUMERIC;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Необходима авторизация';
  END IF;

  SELECT * INTO v_user_profile FROM public.profiles WHERE id = v_current_user_id;

  IF v_user_profile IS NULL THEN
    INSERT INTO public.profiles (id, first_name, role, pending_bonus_balance, has_received_welcome_bonus)
    SELECT v_current_user_id,
      COALESCE(au.raw_user_meta_data->>'first_name', split_part(au.email, '@', 1)),
      'user', 1000, TRUE
    FROM auth.users au WHERE au.id = v_current_user_id
    RETURNING * INTO v_user_profile;
  END IF;

  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award, stock_quantity INTO v_product_record
    FROM public.products WHERE id = v_cart_item.product_id AND is_active = TRUE;

    IF v_product_record IS NULL THEN
      RAISE EXCEPTION 'Товар не найден';
    END IF;

    IF v_product_record.stock_quantity < v_cart_item.quantity THEN
      RAISE EXCEPTION 'Недостаточно товара на складе';
    END IF;

    v_total_price := v_total_price + (v_product_record.price * v_cart_item.quantity);
    v_total_award_bonuses := v_total_award_bonuses + (v_product_record.bonus_points_award * v_cart_item.quantity);
  END LOOP;

  IF p_bonuses_to_spend > 0 THEN
    IF v_user_profile.active_bonus_balance < p_bonuses_to_spend THEN
      RAISE EXCEPTION 'Недостаточно бонусов';
    END IF;

    SELECT COALESCE((value->>'bonus_conversion_rate')::NUMERIC, 1.0)
    INTO v_bonus_rate FROM public.settings WHERE key = 'bonus_system';

    v_calculated_discount := p_bonuses_to_spend * v_bonus_rate;
  END IF;

  v_final_price := GREATEST(v_total_price - v_calculated_discount, 0);

  INSERT INTO public.orders (
    user_id, total_amount, discount_amount, final_amount,
    bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method, status
  )
  VALUES (
    v_current_user_id, v_total_price, v_calculated_discount, v_final_price,
    p_bonuses_to_spend, v_total_award_bonuses, p_delivery_method, p_delivery_address, p_payment_method, 'new'
  )
  RETURNING id INTO v_new_order_id;

  FOR v_cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INTEGER) LOOP
    SELECT price, bonus_points_award INTO v_product_record FROM public.products WHERE id = v_cart_item.product_id;

    INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
    VALUES (v_new_order_id, v_cart_item.product_id, v_cart_item.quantity, v_product_record.price, v_product_record.bonus_points_award);
  END LOOP;

  RETURN v_new_order_id;
END;
$function$;

-- Шаг 7: View для статистики
CREATE OR REPLACE VIEW public.all_orders_stats AS
SELECT 'user' as order_type, COUNT(*) as total_orders, SUM(final_amount) as total_revenue
FROM public.orders
UNION ALL
SELECT 'guest' as order_type, COUNT(*) as total_orders, SUM(final_amount) as total_revenue
FROM public.guest_checkouts;

-- Шаг 8: Функция очистки
CREATE OR REPLACE FUNCTION public.cleanup_expired_guest_checkouts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  UPDATE public.guest_checkouts
  SET expires_at = updated_at + INTERVAL '90 days'
  WHERE status IN ('completed', 'cancelled') AND expires_at IS NULL;

  WITH deleted AS (
    DELETE FROM public.guest_checkouts
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RETURN v_deleted_count;
END;
$function$;

-- Шаг 9: Триггеры
DROP TRIGGER IF EXISTS trigger_guest_checkouts_updated_at ON public.guest_checkouts;
CREATE TRIGGER trigger_guest_checkouts_updated_at
  BEFORE UPDATE ON public.guest_checkouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Шаг 10: RLS
ALTER TABLE public.guest_checkouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guest_checkout_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all guest checkouts" ON public.guest_checkouts;
CREATE POLICY "Admins can view all guest checkouts" ON public.guest_checkouts 
  FOR SELECT TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Admins can manage guest checkouts" ON public.guest_checkouts;
CREATE POLICY "Admins can manage guest checkouts" ON public.guest_checkouts 
  FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

-- Итого
SELECT 'user_orders' as type, COUNT(*) as count FROM public.orders
UNION ALL
SELECT 'guest_checkouts' as type, COUNT(*) as count FROM public.guest_checkouts;