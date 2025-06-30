-- Файл миграции: ..._refactor_menu_items_to_simple_links.sql

-- 1. Удаляем RLS политики, которые могут зависеть от колонки item_type
-- (В вашем случае они не зависели, но это хорошая практика)
DROP POLICY IF EXISTS "Admins can manage menu_items" ON public.menu_items;
-- ... и другие политики для menu_items ...

-- 2. Удаляем триггеры, если они есть
DROP TRIGGER IF EXISTS trigger_menu_items_updated_at ON public.menu_items;

-- 3. Удаляем внешний ключ, если он ссылается на саму таблицу (чтобы избежать проблем при изменении)
-- ALTER TABLE public.menu_items DROP CONSTRAINT IF EXISTS menu_items_parent_slug_fkey;

-- 4. Удаляем колонку item_type
ALTER TABLE public.menu_items DROP COLUMN IF EXISTS item_type;

-- 5. Удаляем сам ENUM тип, если он больше нигде не используется
DROP TYPE IF EXISTS public.menu_item_type_enum;

-- 6. Модифицируем другие колонки, если нужно (например, parent_slug и href)
ALTER TABLE public.menu_items ALTER COLUMN parent_slug SET NOT NULL;
ALTER TABLE public.menu_items ALTER COLUMN href SET NOT NULL;