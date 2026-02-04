-- ============================================================================
-- ИСПРАВЛЕНИЕ: Публичный доступ к Storage бакетам
-- ============================================================================
-- Делает все бакеты с изображениями публичными для отображения на сайте
-- ============================================================================

-- Сделать бакеты публичными
UPDATE storage.buckets
SET public = true
WHERE name IN (
  'product-images',
  'category-images',
  'brand-logos',
  'slides-images',
  'banners'
);

-- Удалить старые политики если есть
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access to image buckets" ON storage.objects;

-- Создать единую политику для публичного чтения
CREATE POLICY "Public read access to image buckets"
ON storage.objects
FOR SELECT
USING (
  bucket_id IN (
    'product-images',
    'category-images',
    'brand-logos',
    'slides-images',
    'banners'
  )
);
