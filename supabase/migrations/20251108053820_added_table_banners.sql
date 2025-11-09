CREATE TABLE public.banners (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    cta_link TEXT, -- Call-to-action link
    is_active BOOLEAN NOT NULL DEFAULT true,
    display_order INT NOT NULL DEFAULT 0,
    placement TEXT NOT NULL DEFAULT 'homepage_gender' -- Для фильтрации баннеров по месту размещения
);

-- Включаем защиту на уровне строк (RLS)
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Политика для публичного чтения активных баннеров
CREATE POLICY "Allow public read access to active banners"
ON public.banners
FOR SELECT USING (is_active = true);

-- Политика для полного доступа администраторов
CREATE POLICY "Allow admin full access"
ON public.banners
FOR ALL USING (auth.role() = 'authenticated' AND is_admin());