-- =====================================================================================
-- ==                                                                                 ==
-- ==           ЕДИНАЯ МИГРАЦИЯ ДЛЯ ПОЛНОЙ ИНИЦИАЛИЗАЦИИ ПРОЕКТА С НУЛЯ              ==
-- ==           Версия 2.1 - Полная и исправленная                                    ==
-- ==                                                                                 ==
-- =====================================================================================

-- === СЕКЦИЯ 0: РАСШИРЕНИЯ ===
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- === СЕКЦИЯ 1: ТАБЛИЦЫ ===
-- Сначала создаем все таблицы, чтобы избежать ошибок зависимостей.

-- 1.1 Таблица PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT, last_name TEXT, phone TEXT,
    role TEXT DEFAULT 'user' NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'admin'::text])),
    bonus_balance INTEGER NOT NULL DEFAULT 0 CHECK (bonus_balance >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.profiles IS 'Профили пользователей с ролями и бонусным балансом.';

-- 1.2 Таблица USER_ADDRESSES
CREATE TABLE IF NOT EXISTS public.user_addresses (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    address_line1 TEXT NOT NULL, city TEXT NOT NULL, postal_code TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.user_addresses IS 'Сохраненные адреса доставки для зарегистрированных пользователей.';

-- 1.3 Таблица CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, href TEXT NOT NULL,
    description TEXT, parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    is_root_category BOOLEAN NOT NULL DEFAULT FALSE,
    display_in_menu BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INTEGER DEFAULT 0 NOT NULL,
    image_url TEXT, icon_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.categories IS 'Единая таблица для категорий каталога и построения меню навигации.';

-- 1.4 Таблица PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0), image_url TEXT,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    bonus_points_award INTEGER NOT NULL DEFAULT 0 CHECK (bonus_points_award >= 0),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    sales_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.products IS 'Товары в каталоге.';

-- 1.5 Таблица SETTINGS
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY, value JSONB, description TEXT, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.settings IS 'Глобальные настройки ключ-значение.';

-- 1.6 Таблица ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    guest_name TEXT, guest_email TEXT, guest_phone TEXT,
    total_amount NUMERIC(10, 2) NOT NULL, discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    final_amount NUMERIC(10, 2) NOT NULL, bonuses_spent INTEGER NOT NULL DEFAULT 0,
    bonuses_awarded INTEGER NOT NULL DEFAULT 0, delivery_method TEXT NOT NULL,
    delivery_address JSONB, payment_method TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'confirmed', 'shipped', 'completed', 'cancelled')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL, updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.orders IS 'Заказы пользователей (авторизованных и гостевых).';

-- 1.7 Таблица ORDER_ITEMS
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price_per_item NUMERIC(10, 2) NOT NULL,
    bonus_points_per_item INTEGER NOT NULL
);
COMMENT ON TABLE public.order_items IS 'Товары, входящие в состав заказа.';

-- 1.8 Таблица SLIDES
CREATE TABLE IF NOT EXISTS public.slides (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    cta_link TEXT,
    cta_text TEXT,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.slides IS 'Слайды для глобальной карусели на сайте.';

-- === СЕКЦИЯ 2: ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION public.current_user_has_role_internal(required_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = lower(required_role)); $$;

-- === СЕКЦИЯ 3: RPC-ФУНКЦИИ (БИЗНЕС-ЛОГИКА) ===

-- 3.1 Функция для получения отфильтрованных товаров
CREATE OR REPLACE FUNCTION public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[] DEFAULT NULL,
    p_price_min NUMERIC DEFAULT NULL,
    p_price_max NUMERIC DEFAULT NULL,
    p_sort_by TEXT DEFAULT 'popularity'
)
RETURNS TABLE (
    id UUID, name TEXT, slug TEXT, description TEXT, price NUMERIC(10, 2),
    image_url TEXT, category_id UUID, bonus_points_award INTEGER,
    stock_quantity INTEGER, sales_count INTEGER, is_active BOOLEAN,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    query TEXT;
    category_ids_subtree UUID[];
    order_by_clause TEXT;
BEGIN
    WITH RECURSIVE category_tree AS (
        SELECT c.id FROM public.categories c WHERE c.slug = p_category_slug
        UNION ALL
        SELECT c.id FROM public.categories c JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT array_agg(id) INTO category_ids_subtree FROM category_tree;
    
    query := 'SELECT * FROM public.products p WHERE p.is_active = TRUE AND p.category_id = ANY($1)';
    IF p_subcategory_ids IS NOT NULL AND array_length(p_subcategory_ids, 1) > 0 THEN
        query := query || ' AND p.category_id = ANY($2)';
    END IF;
    IF p_price_min IS NOT NULL THEN
        query := query || ' AND p.price >= $3';
    END IF;
    IF p_price_max IS NOT NULL THEN
        query := query || ' AND p.price <= $4';
    END IF;
    order_by_clause := CASE p_sort_by
        WHEN 'popularity' THEN 'ORDER BY p.sales_count DESC, p.created_at DESC'
        WHEN 'price_asc'  THEN 'ORDER BY p.price ASC, p.created_at DESC'
        WHEN 'price_desc' THEN 'ORDER BY p.price DESC, p.created_at DESC'
        ELSE 'ORDER BY p.created_at DESC'
    END;
    query := query || ' ' || order_by_clause;
    
    RETURN QUERY EXECUTE query
    USING category_ids_subtree, p_subcategory_ids, p_price_min, p_price_max;
END;
$$;
COMMENT ON FUNCTION public.get_filtered_products IS 'Возвращает отфильтрованный и отсортированный список товаров.';

-- 3.2 Функция для создания нового заказа
CREATE OR REPLACE FUNCTION public.create_order(
    p_cart_items JSONB, p_delivery_method TEXT, p_payment_method TEXT,
    p_delivery_address JSONB DEFAULT NULL, p_guest_info JSONB DEFAULT NULL, p_bonuses_to_spend INT DEFAULT 0
)
RETURNS UUID LANGUAGE plpgsql VOLATILE AS $$
DECLARE
    current_user_id UUID := auth.uid(); user_profile RECORD; new_order_id UUID;
    total_price NUMERIC := 0; total_award_bonuses INT := 0; final_price NUMERIC;
    calculated_discount NUMERIC := 0; cart_item RECORD; product_record RECORD; bonus_rate NUMERIC;
BEGIN
    FOR cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INT) LOOP
        SELECT price, bonus_points_award INTO product_record FROM public.products WHERE id = cart_item.product_id;
        IF product_record IS NULL THEN RAISE EXCEPTION 'Товар с ID % не найден.', cart_item.product_id; END IF;
        total_price := total_price + (product_record.price * cart_item.quantity);
        total_award_bonuses := total_award_bonuses + (product_record.bonus_points_award * cart_item.quantity);
    END LOOP;
    IF current_user_id IS NOT NULL AND p_bonuses_to_spend > 0 THEN
        SELECT * INTO user_profile FROM public.profiles WHERE id = current_user_id;
        IF user_profile.bonus_balance < p_bonuses_to_spend THEN RAISE EXCEPTION 'Недостаточно бонусов.'; END IF;
        SELECT (value->>'rate')::NUMERIC INTO bonus_rate FROM public.settings WHERE key = 'bonus_conversion_rate';
        IF bonus_rate IS NOT NULL THEN calculated_discount := p_bonuses_to_spend * bonus_rate; END IF;
    END IF;
    final_price := total_price - calculated_discount;
    INSERT INTO public.orders (user_id, guest_name, guest_email, guest_phone, total_amount, discount_amount, final_amount, bonuses_spent, bonuses_awarded, delivery_method, delivery_address, payment_method)
    VALUES (current_user_id, p_guest_info->>'name', p_guest_info->>'email', p_guest_info->>'phone', total_price, calculated_discount, final_price, p_bonuses_to_spend, total_award_bonuses, p_delivery_method, p_delivery_address, p_payment_method)
    RETURNING id INTO new_order_id;
    FOR cart_item IN SELECT * FROM jsonb_to_recordset(p_cart_items) AS x(product_id UUID, quantity INT) LOOP
        SELECT price, bonus_points_award INTO product_record FROM public.products WHERE id = cart_item.product_id;
        INSERT INTO public.order_items (order_id, product_id, quantity, price_per_item, bonus_points_per_item)
        VALUES (new_order_id, cart_item.product_id, cart_item.quantity, product_record.price, product_record.bonus_points_award);
    END LOOP;
    RETURN new_order_id;
END;
$$;
COMMENT ON FUNCTION public.create_order IS 'Создает новый заказ со статусом "new".';

-- 3.3 Функция для подтверждения заказа админом
CREATE OR REPLACE FUNCTION public.confirm_and_process_order(p_order_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    target_order RECORD; order_item_record RECORD;
BEGIN
    SELECT * INTO target_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF target_order IS NULL THEN RETURN 'Ошибка: Заказ не найден.'; END IF;
    IF target_order.status <> 'new' THEN RETURN 'Ошибка: Заказ уже обработан.'; END IF;
    FOR order_item_record IN SELECT oi.quantity, p.stock_quantity, p.name FROM public.order_items oi JOIN public.products p ON oi.product_id = p.id WHERE oi.order_id = p_order_id LOOP
        IF order_item_record.stock_quantity < order_item_record.quantity THEN
            RAISE EXCEPTION 'Недостаточно товара "%" на складе.', order_item_record.name;
        END IF;
    END LOOP;
    FOR order_item_record IN SELECT product_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
        UPDATE public.products
        SET stock_quantity = stock_quantity - order_item_record.quantity,
            sales_count = sales_count + order_item_record.quantity
        WHERE id = order_item_record.product_id;
    END LOOP;
    IF target_order.user_id IS NOT NULL THEN
        UPDATE public.profiles
        SET bonus_balance = bonus_balance - target_order.bonuses_spent + target_order.bonuses_awarded
        WHERE id = target_order.user_id;
    END IF;
    UPDATE public.orders SET status = 'confirmed' WHERE id = p_order_id;
    RETURN 'Успех: Заказ ' || p_order_id || ' подтвержден и обработан.';
END;
$$;
COMMENT ON FUNCTION public.confirm_and_process_order IS 'Подтверждает заказ: списывает товары со склада и обрабатывает бонусы.';

-- === СЕКЦИЯ 4: ЗАПОЛНЕНИЕ ДАННЫМИ И БАКЕТЫ ===
INSERT INTO public.settings (key, value, description)
VALUES ('bonus_conversion_rate', '{"rate": 0.5}', 'Курс обмена бонусов. 1 бонус равен X единиц валюты.')
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) VALUES ('category-images', 'category-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('slides-images', 'slides-images', true) ON CONFLICT (id) DO NOTHING;

-- === СЕКЦИЯ 5: ИНДЕКСЫ И ТРИГГЕРЫ ===
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON public.user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_sales_count ON public.products(sales_count DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_categories_updated_at ON public.categories;
CREATE TRIGGER trigger_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_products_updated_at ON public.products;
CREATE TRIGGER trigger_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_settings_updated_at ON public.settings;
CREATE TRIGGER trigger_settings_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_orders_updated_at ON public.orders;
CREATE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_slides_updated_at ON public.slides;
CREATE TRIGGER trigger_slides_updated_at BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === СЕКЦИЯ 6: ПОЛИТИКИ БЕЗОПАСНОСТИ (ROW LEVEL SECURITY) ===
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
CREATE POLICY "Users can manage their own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can see all profiles" ON public.profiles;
CREATE POLICY "Admins can see all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Users can manage their own addresses" ON public.user_addresses;
CREATE POLICY "Users can manage their own addresses" ON public.user_addresses FOR ALL TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public can read categories" ON public.categories;
CREATE POLICY "Public can read categories" ON public.categories FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can manage categories" ON public.categories;
CREATE POLICY "Admins can manage categories" ON public.categories FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Public can read active products" ON public.products;
CREATE POLICY "Public can read active products" ON public.products FOR SELECT TO public USING (is_active = true);
DROP POLICY IF EXISTS "Admins can manage products" ON public.products;
CREATE POLICY "Admins can manage products" ON public.products FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Public can read settings" ON public.settings;
CREATE POLICY "Public can read settings" ON public.settings FOR SELECT TO public USING (true);
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;
CREATE POLICY "Admins can manage settings" ON public.settings FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Users can see their own orders" ON public.orders;
CREATE POLICY "Users can see their own orders" ON public.orders FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Admins can manage all orders" ON public.orders;
CREATE POLICY "Admins can manage all orders" ON public.orders FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Users can see their own order items" ON public.order_items;
CREATE POLICY "Users can see their own order items" ON public.order_items FOR SELECT TO authenticated USING ( (SELECT user_id FROM public.orders WHERE id = order_id) = auth.uid() );
DROP POLICY IF EXISTS "Admins can manage all order items" ON public.order_items;
CREATE POLICY "Admins can manage all order items" ON public.order_items FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Public can view active slides" ON public.slides;
CREATE POLICY "Public can view active slides" ON public.slides FOR SELECT TO public USING (is_active = TRUE);
DROP POLICY IF EXISTS "Admins can manage all slides" ON public.slides;
CREATE POLICY "Admins can manage all slides" ON public.slides FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin'));

-- STORAGE
DROP POLICY IF EXISTS "Public read access for images" ON storage.objects;
CREATE POLICY "Public read access for images" ON storage.objects FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can insert images" ON storage.objects;
CREATE POLICY "Admins can insert images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (public.current_user_has_role_internal('admin'));
    
DROP POLICY IF EXISTS "Admins can update images" ON storage.objects;
CREATE POLICY "Admins can update images" ON storage.objects FOR UPDATE TO authenticated USING (public.current_user_has_role_internal('admin'));
    
DROP POLICY IF EXISTS "Admins can delete images" ON storage.objects;
CREATE POLICY "Admins can delete images" ON storage.objects FOR DELETE TO authenticated USING (public.current_user_has_role_internal('admin'));

-- === СЕКЦИЯ 7: ФУНКЦИИ И ТРИГГЕРЫ ДЛЯ АВТОМАТИЗАЦИИ ===

-- 7.1 Функция для автоматического создания профиля нового пользователя
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS
$function$
BEGIN
  INSERT INTO public.profiles (id, first_name, role)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', 'Новый пользователь'), 
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- 7.2 Триггер для вызова функции создания профиля
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile_creation();


-- 7.3 Функция для защиты от несанкционированного изменения роли
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS
$function$
BEGIN
    -- Разрешаем изменение роли только если текущий пользователь - админ
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.current_user_has_role_internal('admin') THEN
        RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя.';
    END IF;
    RETURN NEW;
END;
$function$;

-- 7.4 Триггер для защиты роли
DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;
CREATE TRIGGER trigger_protect_profile_role_update
BEFORE UPDATE OF role ON public.profiles
FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role)
EXECUTE FUNCTION public.protect_profile_role_update();

-- =====================================================================================
-- ==                     КОНЕЦ ЕДИНОЙ МИГРАЦИИ ИНИЦИАЛИЗАЦИИ                         ==
-- ===================================================================================== 