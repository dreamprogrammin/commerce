-- ================================================================================
-- МИГРАЦИЯ: Исправление canonical_url для категорий (2026-03-31)
-- ================================================================================
-- Проблема: Google Search Console показывает ошибку "Вариант страницы с тегом canonical"
-- для 3 страниц, потому что canonical_url указывает на другие URL
-- 
-- Примеры проблем:
-- - /catalog/babies/katalki → canonical указывает на /catalog/kiddy/katalki
-- - /catalog/kukly-aksessuary → canonical указывает на другой URL
-- - /catalog/boys/cars/radioupravlyaemye-mashinki → canonical указывает на другой URL
-- 
-- Решение: Очистить поле canonical_url для всех категорий.
-- Логика в коде (pages/catalog/[...slug].vue:316-333) автоматически построит
-- правильный canonical на основе category.href
-- ================================================================================

-- Очищаем все canonical_url для категорий
UPDATE public.categories
SET canonical_url = NULL
WHERE canonical_url IS NOT NULL;

-- Добавляем комментарий к колонке
COMMENT ON COLUMN public.categories.canonical_url IS 
'Кастомный canonical URL (опционально). Если NULL, используется category.href из кода.';

-- Аналогично для products (на всякий случай)
UPDATE public.products
SET canonical_url = NULL
WHERE canonical_url IS NOT NULL;

COMMENT ON COLUMN public.products.canonical_url IS 
'Кастомный canonical URL (опционально). Если NULL, используется автоматический URL.';

-- Аналогично для brands
UPDATE public.brands
SET canonical_url = NULL
WHERE canonical_url IS NOT NULL;

COMMENT ON COLUMN public.brands.canonical_url IS 
'Кастомный canonical URL (опционально). Если NULL, используется автоматический URL.';
