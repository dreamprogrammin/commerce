-- =================================================================
-- ==                                                             ==
-- ==       ОБНОВЛЕНИЕ СТРУКТУРЫ МЕНЮ ПЕРВОГО УРОВНЯ               ==
-- ==                                                             ==
-- =================================================================

-- 1. Добавляем "Новинки" и "Акции" как дополнительные пункты меню
-- Эти пункты будут отображаться в начале меню с иконками
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

-- 2. Обновляем существующие категории первого уровня
-- Обновляем display_order чтобы меню шло в нужном порядке после "Новинки" и "Акции"

-- Мальчикам - display_order: 10
UPDATE public.categories
SET display_order = 10
WHERE slug = 'boys' AND parent_id IS NULL;

-- Девочкам - display_order: 20
UPDATE public.categories
SET display_order = 20
WHERE slug = 'girls' AND parent_id IS NULL;

-- Малышам - display_order: 30
UPDATE public.categories
SET display_order = 30
WHERE slug = 'kiddy' AND parent_id IS NULL;

-- Игры и пазлы → переименовываем в "Игры" - display_order: 50
UPDATE public.categories
SET name = 'Игры',
    display_order = 50
WHERE slug = 'games' AND parent_id IS NULL;

-- Творчество - display_order: 60
UPDATE public.categories
SET display_order = 60
WHERE slug = 'crafts' AND parent_id IS NULL;

-- Школа - скрываем из меню (но не удаляем категорию)
UPDATE public.categories
SET display_in_menu = FALSE,
    display_order = 999
WHERE slug = 'school' AND parent_id IS NULL;

-- 3. Добавляем новую корневую категорию "Конструкторы"
-- Сначала проверяем, не существует ли уже такая категория на первом уровне
DO $$
BEGIN
    -- Проверяем, существует ли уже корневая категория "Конструкторы"
    IF NOT EXISTS (
        SELECT 1 FROM public.categories
        WHERE slug = 'constructors-root' AND parent_id IS NULL
    ) THEN
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_order, display_in_menu, icon_name)
        VALUES
            (
                'Конструкторы',
                'constructors-root',
                '/catalog/constructors-root',
                'Конструкторы для детей всех возрастов',
                TRUE,
                40,
                TRUE,
                'lucide:blocks'
            );
        RAISE NOTICE 'Добавлена категория "Конструкторы"';
    END IF;
END $$;

-- 4. Добавляем новую корневую категорию "Отдых"
DO $$
BEGIN
    -- Проверяем, существует ли уже корневая категория "Отдых"
    IF NOT EXISTS (
        SELECT 1 FROM public.categories
        WHERE slug = 'outdoor' AND parent_id IS NULL
    ) THEN
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_order, display_in_menu, icon_name)
        VALUES
            (
                'Отдых',
                'outdoor',
                '/catalog/outdoor',
                'Товары для активного отдыха и спорта',
                TRUE,
                70,
                TRUE,
                'lucide:sun'
            );
        RAISE NOTICE 'Добавлена категория "Отдых"';
    END IF;
END $$;

-- Финальное сообщение
SELECT 'Структура меню успешно обновлена!' AS status;

-- =================================================================
-- ИТОГОВАЯ СТРУКТУРА МЕНЮ:
-- =================================================================
-- 1. Новинки (additional_menu_items, иконка: sparkles)
-- 2. Акции (additional_menu_items, иконка: badge-percent)
-- 3. Мальчикам (category, display_order: 10)
-- 4. Девочкам (category, display_order: 20)
-- 5. Малышам (category, display_order: 30)
-- 6. Конструкторы (category, display_order: 40)
-- 7. Игры (category, display_order: 50)
-- 8. Творчество (category, display_order: 60)
-- 9. Отдых (category, display_order: 70)
-- =================================================================
