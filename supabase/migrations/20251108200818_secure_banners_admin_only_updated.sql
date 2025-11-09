-- ============================================
-- STORAGE: Удаление старых политик и бакета
-- ============================================

DROP POLICY IF EXISTS "Public read access for banners" ON storage.objects;
DROP POLICY IF EXISTS "Public Access for Banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update banners" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete banners" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can upload banners" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can update banners" ON storage.objects;
DROP POLICY IF EXISTS "Only admins can delete banners" ON storage.objects;

DELETE FROM storage.buckets WHERE id = 'banners';

-- ============================================
-- STORAGE: Создание бакета
-- ============================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'banners',
  'banners',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']
);

-- ============================================
-- STORAGE: Политики для бакета
-- ============================================

CREATE POLICY "Public read access for banners"
ON storage.objects FOR SELECT
USING (bucket_id = 'banners');

CREATE POLICY "Only admins can upload banners"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'banners' 
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Only admins can update banners"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'banners' 
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Only admins can delete banners"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'banners' 
  AND (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- TABLE: RLS для таблицы banners
-- ============================================

DROP POLICY IF EXISTS "Public can read active banners" ON public.banners;
DROP POLICY IF EXISTS "Admins can read all banners" ON public.banners;
DROP POLICY IF EXISTS "Only admins can insert banners" ON public.banners;
DROP POLICY IF EXISTS "Only admins can update banners" ON public.banners;
DROP POLICY IF EXISTS "Only admins can delete banners" ON public.banners;

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active banners"
ON public.banners FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can read all banners"
ON public.banners FOR SELECT
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Only admins can insert banners"
ON public.banners FOR INSERT
WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Only admins can update banners"
ON public.banners FOR UPDATE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

CREATE POLICY "Only admins can delete banners"
ON public.banners FOR DELETE
USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
);

-- ============================================
-- TABLE: Добавление SEO полей
-- ============================================

ALTER TABLE public.banners 
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT;

COMMENT ON COLUMN public.banners.seo_title IS 'SEO заголовок для страницы с баннером';
COMMENT ON COLUMN public.banners.seo_description IS 'SEO описание для мета-тегов';