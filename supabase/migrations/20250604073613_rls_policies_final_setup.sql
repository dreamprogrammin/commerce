-- Файл: supabase/migrations/<timestamp>_rls_policies_final_setup.sql

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.current_user_has_role_internal(required_role TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles pr
    WHERE pr.id = auth.uid() AND pr.role = lower(required_role)
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_user_has_role_internal(TEXT) TO authenticated;

-- --- RLS для public.profiles ---
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    TO authenticated -- <--- ЯВНО УКАЗЫВАЕМ ЗДЕСЬ!
    USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    TO authenticated -- <--- ЯВНО УКАЗЫВАЕМ ЗДЕСЬ!
    USING ( auth.uid() = id )
    WITH CHECK ( auth.uid() = id ); -- Простая проверка, так как защита role будет триггером

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
    ON public.profiles FOR SELECT
    TO authenticated -- <--- ЯВНО УКАЗЫВАЕМ ЗДЕСЬ!
    USING (public.current_user_has_role_internal('admin'));

DROP POLICY IF EXISTS "Admins can update any profile" ON public.profiles;
CREATE POLICY "Admins can update any profile"
    ON public.profiles FOR UPDATE
    TO authenticated -- <--- ЯВНО УКАЗЫВАЕМ ЗДЕСЬ!
    USING (public.current_user_has_role_internal('admin'))
    WITH CHECK (public.current_user_has_role_internal('admin'));

-- ВОЗВРАЩАЕМ или УБЕЖДАЕМСЯ В НАЛИЧИИ триггера для защиты поля 'role'
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS
$$
BEGIN
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.current_user_has_role_internal('admin') THEN
        RAISE EXCEPTION 'У вас нет прав на изменение роли пользователя. Только администраторы могут изменять роли.';
    END IF;
    RETURN NEW;
END;
$$;
GRANT EXECUTE ON FUNCTION public.protect_profile_role_update() TO authenticated;

DROP TRIGGER IF EXISTS trigger_protect_profile_role_update ON public.profiles;
CREATE TRIGGER trigger_protect_profile_role_update
    BEFORE UPDATE OF role ON public.profiles
    FOR EACH ROW
    WHEN (OLD.role IS DISTINCT FROM NEW.role)
    EXECUTE FUNCTION public.protect_profile_role_update();