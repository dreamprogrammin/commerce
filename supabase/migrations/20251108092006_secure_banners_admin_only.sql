-- Создание бакета для изображений баннеров
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners',
  'banners',
  true, -- публичный доступ к файлам для чтения
  5242880, -- лимит 5MB на файл
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
);

-- Политика: Все могут читать файлы из бакета
CREATE POLICY "Public read access for banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

-- Политика: Только админы могут загружать баннеры
CREATE POLICY "Only admins can upload banners"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'banners' 
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Политика: Только админы могут обновлять баннеры
CREATE POLICY "Only admins can update banners"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'banners' 
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Политика: Только админы могут удалять баннеры
CREATE POLICY "Only admins can delete banners"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'banners' 
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- RLS политики для таблицы banners
-- ============================================

-- Включаем RLS для таблицы banners (если еще не включен)
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

-- Политика: Все могут читать активные баннеры
CREATE POLICY "Public can read active banners"
ON public.banners FOR SELECT
USING (is_active = true);

-- Политика: Админы могут читать все баннеры (включая неактивные)
CREATE POLICY "Admins can read all banners"
ON public.banners FOR SELECT
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Политика: Только админы могут создавать баннеры
CREATE POLICY "Only admins can insert banners"
ON public.banners FOR INSERT
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Политика: Только админы могут обновлять баннеры
CREATE POLICY "Only admins can update banners"
ON public.banners FOR UPDATE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- Политика: Только админы могут удалять баннеры
CREATE POLICY "Only admins can delete banners"
ON public.banners FOR DELETE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- Опционально: Добавление SEO полей к баннерам
-- ============================================

-- Добавляем SEO поля если их еще нет
DO $$ 
BEGIN
  -- Проверяем существование колонки перед добавлением
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' AND column_name = 'seo_title'
  ) THEN
    ALTER TABLE public.banners ADD COLUMN seo_title TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' AND column_name = 'seo_description'
  ) THEN
    ALTER TABLE public.banners ADD COLUMN seo_description TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'banners' AND column_name = 'seo_keywords'
  ) THEN
    ALTER TABLE public.banners ADD COLUMN seo_keywords TEXT[];
  END IF;
END $$;

-- Комментарии к SEO полям
COMMENT ON COLUMN public.banners.seo_title IS 'SEO заголовок для страницы с баннером';
COMMENT ON COLUMN public.banners.seo_description IS 'SEO описание для мета-тегов';
COMMENT ON COLUMN public.banners.seo_keywords IS 'Массив ключевых слов для SEO';