-- =================================================================
-- ==  ДИАГНОСТИКА: Проверка категорий в базе данных            ==
-- =================================================================

-- 1. Показать ВСЕ корневые категории
SELECT
    id,
    name,
    slug,
    is_root_category,
    display_in_menu,
    display_order,
    created_at
FROM public.categories
WHERE is_root_category = TRUE OR parent_id IS NULL
ORDER BY display_order;

-- 2. Проверить, есть ли категории с нужными slug
SELECT
    CASE
        WHEN EXISTS (SELECT 1 FROM categories WHERE slug = 'boys') THEN '✅ boys существует'
        ELSE '❌ boys НЕТ'
    END as boys_status,
    CASE
        WHEN EXISTS (SELECT 1 FROM categories WHERE slug = 'girls') THEN '✅ girls существует'
        ELSE '❌ girls НЕТ'
    END as girls_status,
    CASE
        WHEN EXISTS (SELECT 1 FROM categories WHERE slug = 'kiddy') THEN '✅ kiddy существует'
        ELSE '❌ kiddy НЕТ'
    END as kiddy_status,
    CASE
        WHEN EXISTS (SELECT 1 FROM categories WHERE slug = 'crafts') THEN '✅ crafts существует'
        ELSE '❌ crafts НЕТ'
    END as crafts_status;

-- 3. Проверить additional_menu_items
SELECT
    key,
    value,
    description
FROM public.settings
WHERE key = 'additional_menu_items';

-- 4. Подсчитать категории
SELECT
    COUNT(*) FILTER (WHERE is_root_category = TRUE) as root_categories_count,
    COUNT(*) FILTER (WHERE is_root_category = TRUE AND display_in_menu = TRUE) as visible_root_count,
    COUNT(*) FILTER (WHERE parent_id IS NOT NULL) as subcategories_count
FROM public.categories;
