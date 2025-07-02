-- Файл: supabase/migrations/<timestamp>_initial_schema.sql
-- Полная, упорядоченная миграция для создания всей кастомной схемы с нуля.

-- === СЕКЦИЯ 1: ОБЩИЕ РАСШИРЕНИЯ И ФУНКЦИИ ===

-- Включаем расширения, если их еще нет.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- Создаем универсальную функцию для автоматического обновления колонки `updated_at`.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


-- === СЕКЦИЯ 2: СОЗДАНИЕ ТАБЛИЦ И БАКЕТА ===

-- 2.1. Создаем таблицу PROFILES.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    role TEXT DEFAULT 'user' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['user'::text, 'admin'::text]))
);

COMMENT ON TABLE public.profiles IS 'Профили пользователей для хранения роли и дополнительной информации.';

-- 2.2. Создаем таблицу MENU_ITEMS.
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    description TEXT,
    parent_slug TEXT NOT NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    image_url TEXT,
    icon_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.menu_items IS 'Подкатегории (ссылки), которые наполняют статические разделы навигационного меню.';

-- 2.3. Создаем бакет для изображений меню в Storage.
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-item-images', 'menu-item-images', true)
ON CONFLICT (id) DO NOTHING;


-- === СЕКЦИЯ 3: ИНДЕКСЫ ===

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles USING btree (role);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_slug ON public.menu_items(parent_slug);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);


-- === СЕКЦИЯ 4: ФУНКЦИИ И ТРИГГЕРЫ, ЗАВИСЯЩИЕ ОТ ТАБЛИЦ ===

-- 4.1. Триггеры для `updated_at`.
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER trigger_menu_items_updated_at
    BEFORE UPDATE ON public.menu_items FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- 4.2. Функция и триггер для автоматического создания профиля.
-- Сначала удаляем старый триггер (если есть), чтобы безопасно обновить функцию.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile_creation();

-- 4.3. Функция для проверки роли (идет до зависимых от нее объектов).
CREATE OR REPLACE FUNCTION public.current_user_has_role_internal(required_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = lower(required_role)); $$;
GRANT EXECUTE ON FUNCTION public.current_user_has_role_internal(text) TO authenticated;

-- 4.4. Функция и триггер для защиты поля 'role' в profiles.
-- Сначала удаляем старый триггер, чтобы безопасно обновить функцию.
DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;

CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.current_user_has_role_internal('admin') THEN
        RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя.';
    END IF;
    RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION public.protect_profile_role_update() TO authenticated;

CREATE TRIGGER trigger_protect_profile_role_update
    BEFORE UPDATE OF role ON public.profiles FOR EACH ROW
    WHEN ((OLD.role IS DISTINCT FROM NEW.role))
    EXECUTE FUNCTION public.protect_profile_role_update();


-- === СЕКЦИЯ 5: RLS (ROW LEVEL SECURITY) ===

-- 5.1. Включаем RLS для всех необходимых таблиц.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
--ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 5.2. Политики для таблицы PROFILES.
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.current_user_has_role_internal('admin')) WITH CHECK (public.current_user_has_role_internal('admin'));

-- 5.3. Политики для таблицы MENU_ITEMS.
DROP POLICY IF EXISTS "Public can read all menu items" ON public.menu_items;
CREATE POLICY "Public can read all menu items" ON public.menu_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage all menu items" ON public.menu_items;
CREATE POLICY "Admins can manage all menu items" ON public.menu_items FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin')) WITH CHECK (public.current_user_has_role_internal('admin'));

-- 5.4. Политики для STORAGE.OBJECTS (бакет 'menu-item-images').
DROP POLICY IF EXISTS "Public read access for menu item images" ON storage.objects;
CREATE POLICY "Public read access for menu item images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'menu-item-images');

DROP POLICY IF EXISTS "Admins can insert menu item images" ON storage.objects;
CREATE POLICY "Admins can insert menu item images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Admins can update menu item images" ON storage.objects;
CREATE POLICY "Admins can update menu item images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin')) WITH CHECK (bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Admins can delete menu item images" ON storage.objects;
CREATE POLICY "Admins can delete menu item images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin'));