-- === СЕКЦИЯ 1: ОБЩИЕ РАСШИРЕНИЯ И ФУНКЦИИ ===
CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";
CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";

-- Функция для автоматического обновления updated_at (используется обеими таблицами)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


-- === СЕКЦИЯ 2: ТАБЛИЦА PROFILES И ЕЕ ЛОГИКА ===

-- Создаем таблицу profiles, если ее нет, с ограничениями
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    first_name TEXT,
    last_name TEXT,
    role TEXT DEFAULT 'user' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'editor'::text]))
);

COMMENT ON TABLE public.profiles IS 'Профили пользователей, связанные с auth.users, для хранения роли и доп. информации.';

-- Создаем индекс, если его нет
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles USING btree (role);

-- Создаем триггер для updated_at на profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
    BEFORE UPDATE ON public.profiles FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Создаем триггерную функцию для автоматического создания профиля
CREATE OR REPLACE FUNCTION public.handle_new_user_profile_creation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, first_name, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'), 'user')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Создаем триггер на auth.users для вызова этой функции
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile_creation();


-- === СЕКЦИЯ 3: ТАБЛИЦА MENU_ITEMS И ЕЕ ЛОГИКА ===

-- Создаем таблицу menu_items, если ее нет, с ограничениями
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

COMMENT ON TABLE public.menu_items IS 'Пункты меню (подкатегории), управляемые из админки.';

-- Создаем индексы, если их нет
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_slug ON public.menu_items(parent_slug);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);

-- Создаем триггер для updated_at на menu_items
DROP TRIGGER IF EXISTS trigger_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER trigger_menu_items_updated_at
    BEFORE UPDATE ON public.menu_items FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();


-- === СЕКЦИЯ 4: RLS И ЗАЩИТНЫЕ МЕХАНИЗМЫ ===

-- Функция для проверки роли (используется в RLS и триггере)
CREATE OR REPLACE FUNCTION public.current_user_has_role_internal(required_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = lower(required_role)); $$;

-- Права на выполнение функции
GRANT EXECUTE ON FUNCTION public.current_user_has_role_internal(text) TO authenticated;

-- Функция и триггер для защиты поля 'role' в profiles
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

DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;
CREATE TRIGGER trigger_protect_profile_role_update
    BEFORE UPDATE OF role ON public.profiles FOR EACH ROW
    WHEN ((OLD.role IS DISTINCT FROM NEW.role))
    EXECUTE FUNCTION public.protect_profile_role_update();

-- Включаем RLS для обеих таблиц
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- --- Политики для PROFILES ---
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles FOR SELECT TO authenticated USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile" ON public.profiles FOR UPDATE TO authenticated USING (public.current_user_has_role_internal('admin')) WITH CHECK (public.current_user_has_role_internal('admin'));


-- --- Политики для MENU_ITEMS ---
DROP POLICY IF EXISTS "Allow public read access to menu items" ON public.menu_items;
CREATE POLICY "Allow public read access to menu items" ON public.menu_items FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Admins can manage menu_items" ON public.menu_items;
CREATE POLICY "Admins can manage menu_items" ON public.menu_items FOR ALL TO authenticated
    USING (public.current_user_has_role_internal('admin'))
    WITH CHECK (public.current_user_has_role_internal('admin'));

-- === СЕКЦИЯ 5: Базовые права (GRANTs) ===
-- Вместо предоставления GRANT ALL, мы отзываем все у anon и authenticated,
-- а затем выдаем только то, что нужно. RLS будет главным механизмом.

REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;
REVOKE ALL ON TABLE public.menu_items FROM anon, authenticated;

-- Выдаем ролям только те права, которые им нужны, чтобы RLS могла работать.
-- RLS - это фильтр поверх этих базовых прав.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.menu_items TO public; -- 'public' включает 'anon' и 'authenticated'
GRANT INSERT, UPDATE, DELETE ON TABLE public.menu_items TO authenticated;