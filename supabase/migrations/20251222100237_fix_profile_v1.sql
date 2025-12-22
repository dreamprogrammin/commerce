-- 1. Функция для создания профиля при регистрации
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    first_name,
    last_name,
    phone,
    role,
    active_bonus_balance,
    pending_bonus_balance,
    has_received_welcome_bonus
  )
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', NEW.raw_user_meta_data->>'name', NULL),
    COALESCE(NEW.raw_user_meta_data->>'last_name', NULL),
    NEW.phone,
    'user',
    0,
    0,
    false
  );
  RETURN NEW;
END;
$$;

-- 2. Триггер для автоматического создания профиля
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. Включаем RLS на таблице profiles (если еще не включено)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4. Политика: пользователь может читать только свой профиль
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- 5. Политика: пользователь может обновлять только свой профиль
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 6. Политика: система может создавать профили (через триггер)
DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  WITH CHECK (true);

-- 7. ВАЖНО: Создаем профиль для существующих пользователей без профиля
INSERT INTO public.profiles (
  id,
  first_name,
  last_name,
  phone,
  role,
  active_bonus_balance,
  pending_bonus_balance,
  has_received_welcome_bonus
)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'first_name', u.raw_user_meta_data->>'name', 'Пользователь'),
  COALESCE(u.raw_user_meta_data->>'last_name', ''),
  u.phone,
  'user',
  0,
  0,
  false
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
WHERE p.id IS NULL;

-- 8. Проверка: показываем созданные профили
SELECT 
  p.id,
  p.first_name,
  p.last_name,
  p.role,
  u.email
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
ORDER BY p.created_at DESC
LIMIT 10;