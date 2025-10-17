-- Up Migration: Обновляем функцию is_admin, чтобы она проверяла роль в таблице profiles

-- CREATE OR REPLACE Function: Эта команда обновит функцию, если она уже существует,
-- или создаст ее, если ее нет.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
-- Устанавливаем search_path, чтобы Supabase точно знал, где искать auth.uid()
SET search_path = public
AS $$
BEGIN
  -- Проверяем, существует ли запись в таблице 'profiles' для текущего пользователя,
  -- у которого 'role' установлена как 'admin'.
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$;


/*
-- Down Migration (Откат)
-- ВАЖНО: Этот блок закомментирован, как вы просили.
-- Здесь мы бы вернули старую версию функции, если бы это было необходимо.
-- Раскомментируйте, если понадобится откат.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin',
    false
  )
$$;

*/