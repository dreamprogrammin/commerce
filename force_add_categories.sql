-- =================================================================
-- ==  ПРИНУДИТЕЛЬНОЕ ДОБАВЛЕНИЕ КАТЕГОРИЙ ДЛЯ МЕНЮ             ==
-- ==  Этот скрипт добавит категории, даже если их нет           ==
-- =================================================================

-- 1. Добавляем/обновляем категорию "Мальчикам"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'boys') THEN
        UPDATE public.categories
        SET
            name = 'Мальчикам',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 10,
            icon_name = 'lucide:user'
        WHERE slug = 'boys';
        RAISE NOTICE '✅ Категория "Мальчикам" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Мальчикам', 'boys', '/catalog/boys', 'Игрушки и товары для мальчиков', TRUE, TRUE, 10, 'lucide:user');
        RAISE NOTICE '✅ Категория "Мальчикам" создана';
    END IF;
END $$;

-- 2. Добавляем/обновляем категорию "Девочкам"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'girls') THEN
        UPDATE public.categories
        SET
            name = 'Девочкам',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 20,
            icon_name = 'lucide:female'
        WHERE slug = 'girls';
        RAISE NOTICE '✅ Категория "Девочкам" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Девочкам', 'girls', '/catalog/girls', 'Куклы, игрушки и мечты для девочек', TRUE, TRUE, 20, 'lucide:female');
        RAISE NOTICE '✅ Категория "Девочкам" создана';
    END IF;
END $$;

-- 3. Добавляем/обновляем категорию "Малышам"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'kiddy') THEN
        UPDATE public.categories
        SET
            name = 'Малышам',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 30,
            icon_name = 'lucide:baby'
        WHERE slug = 'kiddy';
        RAISE NOTICE '✅ Категория "Малышам" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Малышам', 'kiddy', '/catalog/kiddy', 'Безопасные и развивающие игрушки 0-3', TRUE, TRUE, 30, 'lucide:baby');
        RAISE NOTICE '✅ Категория "Малышам" создана';
    END IF;
END $$;

-- 4. Добавляем/обновляем категорию "Конструкторы"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'constructors-root') THEN
        UPDATE public.categories
        SET
            name = 'Конструкторы',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 40,
            icon_name = 'lucide:blocks'
        WHERE slug = 'constructors-root';
        RAISE NOTICE '✅ Категория "Конструкторы" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Конструкторы', 'constructors-root', '/catalog/constructors-root', 'Конструкторы для детей всех возрастов', TRUE, TRUE, 40, 'lucide:blocks');
        RAISE NOTICE '✅ Категория "Конструкторы" создана';
    END IF;
END $$;

-- 5. Добавляем/обновляем категорию "Игры"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'games') THEN
        UPDATE public.categories
        SET
            name = 'Игры',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 50,
            icon_name = 'lucide:gamepad-2'
        WHERE slug = 'games';
        RAISE NOTICE '✅ Категория "Игры" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Игры', 'games', '/catalog/games', 'Настольные игры и пазлы для всей семьи', TRUE, TRUE, 50, 'lucide:gamepad-2');
        RAISE NOTICE '✅ Категория "Игры" создана';
    END IF;
END $$;

-- 6. Добавляем/обновляем категорию "Творчество"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'crafts') THEN
        UPDATE public.categories
        SET
            name = 'Творчество',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 60,
            icon_name = 'lucide:pencil-ruler'
        WHERE slug = 'crafts';
        RAISE NOTICE '✅ Категория "Творчество" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Творчество', 'crafts', '/catalog/crafts', 'Наборы для лепки, рисования и хобби', TRUE, TRUE, 60, 'lucide:pencil-ruler');
        RAISE NOTICE '✅ Категория "Творчество" создана';
    END IF;
END $$;

-- 7. Добавляем/обновляем категорию "Отдых"
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.categories WHERE slug = 'outdoor') THEN
        UPDATE public.categories
        SET
            name = 'Отдых',
            is_root_category = TRUE,
            display_in_menu = TRUE,
            display_order = 70,
            icon_name = 'lucide:sun'
        WHERE slug = 'outdoor';
        RAISE NOTICE '✅ Категория "Отдых" обновлена';
    ELSE
        INSERT INTO public.categories
            (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
        VALUES
            ('Отдых', 'outdoor', '/catalog/outdoor', 'Товары для активного отдыха и спорта', TRUE, TRUE, 70, 'lucide:sun');
        RAISE NOTICE '✅ Категория "Отдых" создана';
    END IF;
END $$;

-- 8. Добавляем дополнительные пункты меню (Новинки, Акции)
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

-- 9. ИТОГОВАЯ ПРОВЕРКА
SELECT
    '=== КОРНЕВЫЕ КАТЕГОРИИ В МЕНЮ ===' as info;

SELECT
    name,
    slug,
    display_order,
    display_in_menu,
    is_root_category
FROM public.categories
WHERE is_root_category = TRUE
ORDER BY display_order;

-- 10. Проверка additional_menu_items
SELECT
    '=== ДОПОЛНИТЕЛЬНЫЕ ПУНКТЫ МЕНЮ ===' as info;

SELECT value FROM public.settings WHERE key = 'additional_menu_items';
