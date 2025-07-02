-- Файл: supabase/migrations/<timestamp>_add_phone_to_profiles.sql

-- Добавляем колонку 'phone' в таблицу 'profiles', если ее еще нет
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone TEXT; -- Делаем ее NULLABLE (не NOT NULL)

-- Добавляем комментарий
COMMENT ON COLUMN public.profiles.phone IS 'Контактный телефон пользователя.';