-- Файл: supabase/migrations/20240523180000_complete_setup.sql
-- Полная, унифицированная миграция для создания всей схемы проекта с нуля,
-- адаптированная под вашу локальную среду.

SET check_function_bodies = OFF;

-- === СЕКЦИЯ 1: ОБЩИЕ РАСШИРЕНИЯ И ФУНКЦИИ ===

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

-- === СЕКЦИЯ 2: СОЗДАНИЕ ТАБЛИЦ ===

-- 2.1. Таблица PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    phone TEXT, -- Добавлено поле phone
    role TEXT DEFAULT 'user' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['user'::text, 'admin'::text]))
);
COMMENT ON TABLE public.profiles IS 'Профили пользователей для хранения роли и дополнительной информации.';
COMMENT ON COLUMN public.profiles.phone IS 'Контактный телефон пользователя.';

-- 2.2. Таблица MENU_ITEMS
CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    href TEXT NOT NULL,
    description TEXT,
    parent_slug TEXT NOT NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    image_url TEXT,
    icon_name TEXT,
    is_featured_on_homepage BOOLEAN NOT NULL DEFAULT FALSE, -- Добавлен флаг для главной страницы
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
COMMENT ON TABLE public.menu_items IS 'Подкатегории (ссылки), которые наполняют статические разделы навигационного меню.';
COMMENT ON COLUMN public.menu_items.is_featured_on_homepage IS 'Отметка для показа этого пункта в блоке "Популярные категории" на главной странице.';

-- 2.3. Таблица SLIDES
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

-- === СЕКЦИЯ 3: ИНДЕКСЫ ===

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles USING btree (role);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_slug ON public.menu_items(parent_slug);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_featured ON public.menu_items(is_featured_on_homepage) WHERE is_featured_on_homepage = TRUE;
CREATE INDEX IF NOT EXISTS idx_slides_active_order ON public.slides(is_active, display_order);

-- === СЕКЦИЯ 4: ТРИГГЕРЫ ===

DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER trigger_menu_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_slides_updated_at ON public.slides;
CREATE TRIGGER trigger_slides_updated_at BEFORE UPDATE ON public.slides FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- === СЕКЦИЯ 5: STORAGE (БАКЕТЫ) - ИСПОЛЬЗУЕМ РАБОЧИЙ СИНТАКСИС INSERT ===

-- Создание бакета для изображений меню
INSERT INTO storage.buckets (id, name, public)
VALUES ('menu-item-images', 'menu-item-images', true)
ON CONFLICT (id) DO NOTHING;

-- Создание бакета для изображений слайдера
INSERT INTO storage.buckets (id, name, public)
VALUES ('slides-images', 'slides-images', true)
ON CONFLICT (id) DO NOTHING;

-- === СЕКЦИЯ 6: ФУНКЦИИ ДЛЯ RLS И АВТОМАТИЗАЦИИ ===

CREATE OR REPLACE FUNCTION public.current_user_has_role_internal(required_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = lower(required_role)); $$;
GRANT EXECUTE ON FUNCTION public.current_user_has_role_internal(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS
$function$
BEGIN
  INSERT INTO public.profiles (id, first_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile_creation();

CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS
$function$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.current_user_has_role_internal('admin') THEN
        RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя.';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;
CREATE TRIGGER trigger_protect_profile_role_update BEFORE UPDATE OF role ON public.profiles FOR EACH ROW WHEN (OLD.role IS DISTINCT FROM NEW.role) EXECUTE FUNCTION public.protect_profile_role_update();

-- === СЕКЦИЯ 7: ПОЛИТИКИ БЕЗОПАСНОСТИ (ROW LEVEL SECURITY) ===

-- 7.1. Включение RLS для таблиц
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

-- 7.2. Политики для PROFILES
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Admins can manage profiles" ON public.profiles;
CREATE POLICY "Admins can manage profiles" ON public.profiles FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin')) WITH CHECK (public.current_user_has_role_internal('admin'));

-- 7.3. Политики для MENU_ITEMS
DROP POLICY IF EXISTS "Public can read all menu items" ON public.menu_items;
CREATE POLICY "Public can read all menu items" ON public.menu_items FOR SELECT TO public USING (TRUE);
DROP POLICY IF EXISTS "Admins can manage all menu items" ON public.menu_items;
CREATE POLICY "Admins can manage all menu items" ON public.menu_items FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin')) WITH CHECK (public.current_user_has_role_internal('admin'));

-- 7.4. Политики для SLIDES
DROP POLICY IF EXISTS "Public can view active slides" ON public.slides;
CREATE POLICY "Public can view active slides" ON public.slides FOR SELECT TO public USING (is_active = TRUE);
DROP POLICY IF EXISTS "Admins can manage all slides" ON public.slides;
CREATE POLICY "Admins can manage all slides" ON public.slides FOR ALL TO authenticated USING (public.current_user_has_role_internal('admin')) WITH CHECK (public.current_user_has_role_internal('admin'));

-- 7.5. Политики для STORAGE
-- Политика для бакета 'menu-item-images'
DROP POLICY IF EXISTS "Public read access for menu item images" ON storage.objects;
CREATE POLICY "Public read access for menu item images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'menu-item-images');
DROP POLICY IF EXISTS "Admins can manage menu item images" ON storage.objects;
CREATE POLICY "Admins can manage menu item images" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin')) WITH CHECK (bucket_id = 'menu-item-images' AND public.current_user_has_role_internal('admin'));

-- Политика для бакета 'slides-images'
DROP POLICY IF EXISTS "Public read access for slide images" ON storage.objects;
CREATE POLICY "Public read access for slide images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'slides-images');
DROP POLICY IF EXISTS "Admins can manage slide images" ON storage.objects;
CREATE POLICY "Admins can manage slide images" ON storage.objects FOR ALL TO authenticated USING (bucket_id = 'slides-images' AND public.current_user_has_role_internal('admin')) WITH CHECK (bucket_id = 'slides-images' AND public.current_user_has_role_internal('admin'));