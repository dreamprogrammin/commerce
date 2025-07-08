-- Файл: supabase/migrations/<timestamp>_create_slides_feature.sql
-- Полная миграция для создания функционала слайдера.

-- === СЕКЦИЯ 1: СОЗДАНИЕ ТАБЛИЦЫ SLIDES ===

CREATE TABLE IF NOT EXISTS public.slides (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    cta_link TEXT,  -- Ссылка для кнопки "Call To Action"
    cta_text TEXT,  -- Текст для кнопки "Call To Action"
    is_active BOOLEAN DEFAULT true NOT NULL,
    display_order INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

COMMENT ON TABLE public.slides IS 'Слайды для глобальной карусели на сайте.';
COMMENT ON COLUMN public.slides.cta_link IS 'Ссылка для кнопки призыва к действию (например, /catalog/new).';
COMMENT ON COLUMN public.slides.is_active IS 'Флаг для включения/выключения показа слайда.';
COMMENT ON COLUMN public.slides.display_order IS 'Порядок сортировки слайдов (меньше = раньше).';


-- === СЕКЦИЯ 2: ИНДЕКСЫ И ТРИГГЕРЫ ===

-- Индексы для быстрой выборки активных и отсортированных слайдов
CREATE INDEX IF NOT EXISTS idx_slides_active_order ON public.slides(is_active, display_order);

-- Триггер для автоматического обновления колонки `updated_at`
-- Мы используем функцию `update_updated_at_column`, которую вы создали ранее.
DROP TRIGGER IF EXISTS trigger_slides_updated_at ON public.slides;
CREATE TRIGGER trigger_slides_updated_at
    BEFORE UPDATE ON public.slides FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();


-- === СЕКЦИЯ 3: БАКЕТ ДЛЯ ИЗОБРАЖЕНИЙ В STORAGE ===

-- Создаем отдельный бакет для изображений слайдов, делаем его публичным.
INSERT INTO storage.buckets (id, name, public)
VALUES ('slides-images', 'slides-images', true)
ON CONFLICT (id) DO NOTHING;


-- === СЕКЦИЯ 4: ПОЛИТИКИ БЕЗОПАСНОСТИ (ROW LEVEL SECURITY) ===

-- 4.1. Включаем RLS для новой таблицы
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

-- 4.2. Политики для таблицы SLIDES
-- Все пользователи (включая анонимных) могут видеть АКТИВНЫЕ слайды.
DROP POLICY IF EXISTS "Public can view active slides" ON public.slides;
CREATE POLICY "Public can view active slides"
    ON public.slides FOR SELECT
    TO public
    USING (is_active = true);

-- Только администраторы могут управлять (создавать, обновлять, удалять) слайдами.
-- Используем вашу существующую функцию `current_user_has_role_internal`.
DROP POLICY IF EXISTS "Admins can manage all slides" ON public.slides;
CREATE POLICY "Admins can manage all slides"
    ON public.slides FOR ALL
    TO authenticated
    USING (public.current_user_has_role_internal('admin'))
    WITH CHECK (public.current_user_has_role_internal('admin'));

-- 4.3. Политики для бакета 'slides-images' в STORAGE
-- Все могут читать изображения из бакета слайдов.
DROP POLICY IF EXISTS "Public read access for slide images" ON storage.objects;
CREATE POLICY "Public read access for slide images"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'slides-images');

-- Только администраторы могут загружать, обновлять и удалять изображения в бакете слайдов.
DROP POLICY IF EXISTS "Admins can manage slide images" ON storage.objects;
CREATE POLICY "Admins can manage slide images"
    ON storage.objects FOR ALL
    TO authenticated
    USING (bucket_id = 'slides-images' AND public.current_user_has_role_internal('admin'))
    WITH CHECK (bucket_id = 'slides-images' AND public.current_user_has_role_internal('admin'));