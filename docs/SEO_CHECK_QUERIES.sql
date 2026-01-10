-- 🔍 SQL запросы для диагностики SEO проблем
-- Выполните эти запросы в Supabase Dashboard → SQL Editor

-- ==========================================
-- 1. ПРОВЕРКА ТОВАРОВ
-- ==========================================

-- Общее количество товаров
SELECT
  COUNT(*) as total_products,
  COUNT(CASE WHEN is_active = true THEN 1 END) as active_products,
  COUNT(CASE WHEN slug IS NOT NULL AND slug != '' THEN 1 END) as products_with_slug,
  COUNT(CASE WHEN is_active = true AND slug IS NOT NULL AND slug != '' THEN 1 END) as indexable_products
FROM products;

-- Примеры товаров с проблемами
SELECT
  id,
  name,
  slug,
  is_active,
  created_at,
  CASE
    WHEN slug IS NULL OR slug = '' THEN 'Missing slug'
    WHEN is_active = false THEN 'Inactive'
    ELSE 'OK'
  END as issue
FROM products
WHERE (slug IS NULL OR slug = '' OR is_active = false)
LIMIT 10;

-- ==========================================
-- 2. ПРОВЕРКА КАТЕГОРИЙ
-- ==========================================

-- Общее количество категорий
SELECT
  COUNT(*) as total_categories,
  COUNT(CASE WHEN slug IS NOT NULL AND slug != '' THEN 1 END) as categories_with_slug
FROM categories;

-- Категории без slug
SELECT
  id,
  name,
  slug,
  created_at
FROM categories
WHERE slug IS NULL OR slug = ''
LIMIT 10;

-- ==========================================
-- 3. ПРОВЕРКА БРЕНДОВ
-- ==========================================

-- Общее количество брендов
SELECT
  COUNT(*) as total_brands,
  COUNT(CASE WHEN slug IS NOT NULL AND slug != '' THEN 1 END) as brands_with_slug
FROM brands;

-- ==========================================
-- 4. ИСПРАВЛЕНИЕ ПРОБЛЕМ
-- ==========================================

-- ВАРИАНТ 1: Активировать все товары (если они должны быть активны)
-- UPDATE products
-- SET is_active = true
-- WHERE is_active = false;

-- ВАРИАНТ 2: Сгенерировать slug для товаров без slug (используйте с осторожностью!)
-- UPDATE products
-- SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9а-яА-Я\s-]', '', 'g'))
-- WHERE slug IS NULL OR slug = '';

-- ВАРИАНТ 3: Показать товары, которые должны быть в sitemap
SELECT
  'https://uhti.kz/catalog/products/' || slug as url,
  name,
  is_active,
  stock_quantity,
  created_at
FROM products
WHERE is_active = true
  AND slug IS NOT NULL
  AND slug != ''
ORDER BY created_at DESC
LIMIT 20;

-- ==========================================
-- 5. ПРОВЕРКА UPDATED_AT (для lastmod в sitemap)
-- ==========================================

-- Товары без updated_at
SELECT COUNT(*) as products_without_updated_at
FROM products
WHERE updated_at IS NULL;

-- Категории без updated_at
SELECT COUNT(*) as categories_without_updated_at
FROM categories
WHERE updated_at IS NULL;
