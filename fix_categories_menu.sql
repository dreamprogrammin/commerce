-- =================================================================
-- ==  СКРИПТ ДЛЯ ИСПРАВЛЕНИЯ ОТОБРАЖЕНИЯ КАТЕГОРИЙ В МЕНЮ       ==
-- ==  Выполните этот скрипт в Supabase SQL Editor               ==
-- =================================================================

-- 1. Включаем отображение в меню для всех корневых категорий
UPDATE public.categories
SET display_in_menu = TRUE
WHERE is_root_category = TRUE;

-- 2. Включаем отображение в меню для всех подкатегорий
UPDATE public.categories
SET display_in_menu = TRUE
WHERE parent_id IS NOT NULL;

-- 3. Проверяем результат
SELECT
    id,
    name,
    slug,
    is_root_category,
    display_in_menu,
    display_order,
    parent_id
FROM public.categories
WHERE is_root_category = TRUE
ORDER BY display_order;

-- 4. Проверяем дополнительные пункты меню (Новинки, Акции)
SELECT * FROM public.settings WHERE key = 'additional_menu_items';

-- Если additional_menu_items нет, добавим их:
INSERT INTO public.settings (key, value, description)
VALUES (
    'additional_menu_items',
    '[
        {
            "id": "new-items",
            "name": "Новинки",
            "href": "/catalog/new",
            "icon": "lucide:sparkles",
            "display_order": 1
        },
        {
            "id": "promotions",
            "name": "Акции",
            "href": "/catalog/promotions",
            "icon": "lucide:badge-percent",
            "display_order": 2
        }
    ]'::jsonb,
    'Дополнительные пункты меню (Новинки, Акции)'
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = EXCLUDED.description,
    updated_at = now();

SELECT 'Категории успешно исправлены! Обновите страницу браузера.' AS status;
