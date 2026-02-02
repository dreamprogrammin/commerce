-- =================================================================
-- ==  СКРИПТ ДЛЯ PRODUCTION: ИСПРАВЛЕНИЕ МЕНЮ                   ==
-- ==  Безопасный скрипт без изменения ролей пользователей       ==
-- =================================================================

-- 1. Включаем отображение в меню для всех корневых категорий
UPDATE public.categories
SET display_in_menu = TRUE
WHERE is_root_category = TRUE;

-- 2. Включаем отображение в меню для всех подкатегорий
UPDATE public.categories
SET display_in_menu = TRUE
WHERE parent_id IS NOT NULL;

-- 3. Добавляем/обновляем дополнительные пункты меню (Новинки, Акции)
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

-- 4. Обновляем название категории "Игры и пазлы" -> "Игры"
UPDATE public.categories
SET name = 'Игры'
WHERE slug = 'games' AND is_root_category = TRUE;

-- 5. Скрываем категорию "Школа" из меню (если существует)
UPDATE public.categories
SET display_in_menu = FALSE
WHERE slug = 'school' AND is_root_category = TRUE;

-- 6. Добавляем категорию "Конструкторы" (если не существует)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = 'constructors-root' AND is_root_category = TRUE) THEN
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            (
                'Конструкторы',
                'constructors-root',
                '/catalog/constructors-root',
                'Конструкторы для детей всех возрастов',
                TRUE,
                TRUE,
                40,
                'lucide:blocks'
            );
    ELSE
        UPDATE public.categories
        SET display_in_menu = TRUE, display_order = 40
        WHERE slug = 'constructors-root' AND is_root_category = TRUE;
    END IF;
END $$;

-- 7. Добавляем категорию "Отдых" (если не существует)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.categories WHERE slug = 'outdoor' AND is_root_category = TRUE) THEN
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            (
                'Отдых',
                'outdoor',
                '/catalog/outdoor',
                'Товары для активного отдыха и спорта',
                TRUE,
                TRUE,
                70,
                'lucide:sun'
            );
    ELSE
        UPDATE public.categories
        SET display_in_menu = TRUE, display_order = 70
        WHERE slug = 'outdoor' AND is_root_category = TRUE;
    END IF;
END $$;

-- 8. Проверяем результат
SELECT
    name,
    slug,
    is_root_category,
    display_in_menu,
    display_order
FROM public.categories
WHERE is_root_category = TRUE
ORDER BY display_order;

-- 9. Проверяем дополнительные пункты меню
SELECT value FROM public.settings WHERE key = 'additional_menu_items';
