-- Up Migration: Устанавливаем политики на чтение

-- Удаляем старую политику для 'brands', если она существует, чтобы избежать конфликтов
DROP POLICY IF EXISTS "Enable read access for all users" ON public.brands;

-- Создаем новую политику, которая разрешает чтение таблицы 'brands' всем
CREATE POLICY "Enable read access for all users"
ON public.brands
FOR SELECT
USING (TRUE);


-- Удаляем старую политику для 'materials', если она существует
DROP POLICY IF EXISTS "Enable read access for all users" ON public.materials;

-- Создаем новую политику, которая разрешает чтение таблицы 'materials' всем
CREATE POLICY "Enable read access for all users"
ON public.materials
FOR SELECT
USING (TRUE);



/*
-- Down Migration (Откат)
-- ВАЖНО: Этот блок закомментирован.
-- Мы не хотим случайно удалить эти политики при откате.
-- Если вам когда-нибудь понадобится их удалить, вы можете раскомментировать этот код
-- и выполнить откат миграции.

DROP POLICY IF EXISTS "Enable read access for all users" ON public.brands;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.materials;

*/