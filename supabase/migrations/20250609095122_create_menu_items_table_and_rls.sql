CREATE TABLE IF NOT EXISTS public.menu_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    href TEXT,
    description TEXT,
    item_type TEXT NOT NULL CHECK (item_type IN ('link', 'trigger', 'trigger_and_link')),
    parent_slug TEXT REFERENCES public.menu_items(slug) ON DELETE CASCADE ON UPDATE CASCADE,
    display_order INTEGER DEFAULT 0 NOT NULL,
    image_url TEXT, -- Для URL изображения
    icon_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.menu_items IS 'Элементы навигационного меню сайта.';
COMMENT ON COLUMN public.menu_items.image_url IS 'URL или путь к изображению для пункта меню.';
-- Добавьте другие комментарии к колонкам, если хотите

-- Индексы для menu_items (ТОЛЬКО ЕСЛИ НЕ СУЩЕСТВУЮТ)
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_slug ON public.menu_items(parent_slug);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_item_type ON public.menu_items(item_type);

-- Триггер для 'updated_at' на таблице 'menu_items'
-- (Предполагается, что функция public.update_updated_at_column() уже создана предыдущей миграцией для profiles)
DROP TRIGGER IF EXISTS trigger_menu_items_updated_at ON public.menu_items;
CREATE TRIGGER trigger_menu_items_updated_at
    BEFORE UPDATE ON public.menu_items
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Включение RLS для таблицы menu_items
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- RLS Политики для menu_items:
-- 1. Разрешить публичное чтение всем (чтобы обычные пользователи видели меню)
DROP POLICY IF EXISTS "Allow public read access to menu items" ON public.menu_items;
CREATE POLICY "Allow public read access to menu items"
    ON public.menu_items
    FOR SELECT
    TO public -- Можно указать public или anon, authenticated. Для меню обычно public.
    USING (true);

-- 2. Разрешить пользователям с ролью 'admin' все операции
--    (Предполагается, что функция public.current_user_has_role_internal(TEXT) уже создана)
DROP POLICY IF EXISTS "Admins can manage menu_items" ON public.menu_items;
CREATE POLICY "Admins can manage menu_items"
    ON public.menu_items
    FOR ALL -- SELECT, INSERT, UPDATE, DELETE
    TO authenticated -- Политика применяется к аутентифицированным пользователям
    USING (public.current_user_has_role_internal('admin')) -- Для SELECT, UPDATE, DELETE (какие строки можно трогать)
    WITH CHECK (public.current_user_has_role_internal('admin')); -- Для INSERT, UPDATE (можно ли вообще это делать)