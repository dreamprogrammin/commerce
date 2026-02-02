-- =================================================================
-- ==                                                             ==
-- ==       ФАЙЛ ДЛЯ ЗАПОЛНЕНИЯ БАЗЫ ТЕСТОВЫМИ ДАННЫМИ            ==
-- ==       Выполняется автоматически после `supabase db reset`   ==
-- ==                                                             ==
-- =================================================================

-- 1. Полная очистка таблиц перед заполнением.
-- `TRUNCATE ... RESTART IDENTITY CASCADE` - это более мощная команда, чем DELETE.
-- Она быстро удаляет все данные, сбрасывает счетчики ID и автоматически
-- обрабатывает связанные таблицы.
TRUNCATE TABLE public.products, public.categories RESTART IDENTITY CASCADE;


-- 2. Создаем дополнительные пункты меню (Новинки, Акции)
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

-- 3. Создаем КОРНЕВЫЕ категории (1-й уровень)
INSERT INTO public.categories
    (name, slug, href, description, is_root_category, display_in_menu, display_order, icon_name)
VALUES
    ('Мальчикам', 'boys', '/catalog/boys', 'Игрушки и товары для мальчиков', TRUE, TRUE, 10, 'lucide:user'),
    ('Девочкам', 'girls', '/catalog/girls', 'Куклы, игрушки и мечты для девочек', TRUE, TRUE, 20, 'lucide:female'),
    ('Малышам', 'kiddy', '/catalog/kiddy', 'Безопасные и развивающие игрушки 0-3', TRUE, TRUE, 30, 'lucide:baby'),
    ('Конструкторы', 'constructors-root', '/catalog/constructors-root', 'Конструкторы для детей всех возрастов', TRUE, TRUE, 40, 'lucide:blocks'),
    ('Игры', 'games', '/catalog/games', 'Настольные игры и пазлы для всей семьи', TRUE, TRUE, 50, 'lucide:gamepad-2'),
    ('Творчество', 'crafts', '/catalog/crafts', 'Наборы для лепки, рисования и хобби', TRUE, TRUE, 60, 'lucide:pencil-ruler'),
    ('Отдых', 'outdoor', '/catalog/outdoor', 'Товары для активного отдыха и спорта', TRUE, TRUE, 70, 'lucide:sun');


-- 4. Создаем ПОДКАТЕГОРИИ (2-й уровень)

-- Подкатегории для "Мальчикам"
INSERT INTO public.categories (name, slug, href, parent_id, display_in_menu, display_order) VALUES
    ('Машинки и транспорт', 'cars', '/catalog/boys/cars', (SELECT id FROM public.categories WHERE slug = 'boys'), TRUE, 1),
    ('Конструкторы', 'constructors', '/catalog/boys/constructors', (SELECT id FROM public.categories WHERE slug = 'boys'), TRUE, 2),
    ('Роботы и трансформеры', 'robots', '/catalog/boys/robots', (SELECT id FROM public.categories WHERE slug = 'boys'), TRUE, 3);

-- Подкатегории для "Девочкам"
INSERT INTO public.categories (name, slug, href, parent_id, display_in_menu, display_order) VALUES
    ('Куклы и пупсы', 'dolls', '/catalog/girls/dolls', (SELECT id FROM public.categories WHERE slug = 'girls'), TRUE, 1),
    ('Игровые наборы', 'playsets', '/catalog/girls/playsets', (SELECT id FROM public.categories WHERE slug = 'girls'), TRUE, 2),
    ('Мягкие игрушки', 'plush-toys', '/catalog/girls/plush-toys', (SELECT id FROM public.categories WHERE slug = 'girls'), TRUE, 3);

-- Подкатегории для "Малышам"
INSERT INTO public.categories (name, slug, href, parent_id, display_in_menu, display_order) VALUES
    ('Погремушки и грызунки', 'rattles', '/catalog/kiddy/rattles', (SELECT id FROM public.categories WHERE slug = 'kiddy'), TRUE, 1),
    ('Развивающие коврики', 'playmats', '/catalog/kiddy/playmats', (SELECT id FROM public.categories WHERE slug = 'kiddy'), TRUE, 2),
    ('Сортеры и пирамидки', 'sorters', '/catalog/kiddy/sorters', (SELECT id FROM public.categories WHERE slug = 'kiddy'), TRUE, 3);

-- Подкатегории для "Игры и пазлы"
INSERT INTO public.categories (name, slug, href, parent_id, display_in_menu, display_order) VALUES
    ('Настольные игры', 'board-games', '/catalog/games/board-games', (SELECT id FROM public.categories WHERE slug = 'games'), TRUE, 1),
    ('Пазлы', 'puzzles', '/catalog/games/puzzles', (SELECT id FROM public.categories WHERE slug = 'games'), TRUE, 2);


-- 5. Наполняем ТОВАРАМИ

-- Товары в категории "Машинки и транспорт"
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Гоночный болид "Молния"', 'racing-car-lightning', 'Супер-быстрая гоночная машинка красного цвета.', 7500.00, (SELECT id FROM public.categories WHERE slug = 'cars'), 30, 375, TRUE),
    ('Пожарная машина "Герой"', 'fire-truck-hero', 'Большая пожарная машина с лестницей и звуковыми эффектами.', 12000.00, (SELECT id FROM public.categories WHERE slug = 'cars'), 15, 600, TRUE),
    ('Самосвал "Строитель"', 'dump-truck-builder', 'Прочный самосвал для игр в песочнице.', 5500.00, (SELECT id FROM public.categories WHERE slug = 'cars'), 50, 275, TRUE);

-- Товары в категории "Конструкторы"
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Конструктор "Космический шаттл"', 'space-shuttle-constructor', 'Собери детализированную модель космического шаттла. 500 деталей.', 15000.00, (SELECT id FROM public.categories WHERE slug = 'constructors'), 20, 750, TRUE),
    ('Магнитный конструктор "Магия форм"', 'magnetic-constructor-magic', 'Набор из 40 магнитных деталей для развития воображения.', 9800.00, (SELECT id FROM public.categories WHERE slug = 'constructors'), 40, 490, TRUE);

-- Товары в категории "Куклы и пупсы"
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Кукла "Принцесса Аврора"', 'doll-princess-aurora', 'Элегантная кукла в бальном платье с аксессуарами.', 8900.00, (SELECT id FROM public.categories WHERE slug = 'dolls'), 25, 445, TRUE),
    ('Интерактивный пупс "Малыш"', 'interactive-baby-doll', 'Плачет, смеется и говорит "мама". В комплекте бутылочка и соска.', 14500.00, (SELECT id FROM public.categories WHERE slug = 'dolls'), 18, 725, TRUE);

-- Товары в категории "Игровые наборы" (для девочек)
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Игровой набор "Кухня шеф-повара"', 'playset-chef-kitchen', 'Детская кухня с посудой, продуктами и световыми эффектами.', 22000.00, (SELECT id FROM public.categories WHERE slug = 'playsets'), 10, 1100, TRUE),
    ('Набор доктора "Айболит"', 'playset-doctor-kit', 'Все необходимое для маленького доктора в удобном чемоданчике.', 6500.00, (SELECT id FROM public.categories WHERE slug = 'playsets'), 35, 325, TRUE);
    
-- Товары в категории "Сортеры и пирамидки"
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Деревянный сортер "Геометрия"', 'wooden-sorter-geometry', 'Развивает логику и моторику. Сделан из экологичного дерева.', 4500.00, (SELECT id FROM public.categories WHERE slug = 'sorters'), 60, 225, TRUE),
    ('Пирамидка "Радуга"', 'rainbow-pyramid', 'Классическая игрушка из 7 цветных колец.', 2500.00, (SELECT id FROM public.categories WHERE slug = 'sorters'), 100, 125, TRUE);

-- Товары в категории "Настольные игры"
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Настольная игра "Монополия"', 'board-game-monopoly', 'Классическая экономическая игра для всей семьи.', 11000.00, (SELECT id FROM public.categories WHERE slug = 'board-games'), 30, 550, TRUE),
    ('Игра "Дженга"', 'jenga-game', 'Построй башню и не дай ей упасть. Развивает ловкость.', 5000.00, (SELECT id FROM public.categories WHERE slug = 'board-games'), 50, 250, TRUE);

-- Несколько неактивных товаров для теста
INSERT INTO public.products (name, slug, description, price, category_id, stock_quantity, bonus_points_award, is_active) VALUES
    ('Старый робот (неактивен)', 'old-robot-inactive', 'Этот товар не должен быть виден на сайте.', 999.00, (SELECT id FROM public.categories WHERE slug = 'robots'), 0, 50, FALSE);

-- Сообщение в консоль после выполнения
SELECT 'База данных успешно наполнена тестовыми данными!' AS status;

DO $$
DECLARE
    -- Переменная для хранения ID админа
    admin_user_id UUID;
BEGIN
    -- 1. Находим ID пользователя в служебной таблице `auth.users` по его email.
    --    ВАЖНО: Замени 'твой-email@example.com' на свой реальный email!
    SELECT id INTO admin_user_id FROM auth.users WHERE email = 'richardmy503@gmail.com';

    -- 2. Если пользователь с таким email найден...
    IF admin_user_id IS NOT NULL THEN
        -- ...обновляем его профиль в `public.profiles`, устанавливая роль 'admin'.
        -- `ON CONFLICT (id) DO UPDATE` - это "умная" команда:
        -- Если профиль уже существует (создан триггером), она его обновит.
        -- Если профиля еще нет, она ничего не сделает (но триггер уже должен был его создать).
        UPDATE public.profiles
        SET role = 'admin'
        WHERE id = admin_user_id;

        -- Выводим сообщение в консоль, что все прошло успешно.
        RAISE NOTICE 'Пользователю с email % успешно присвоена роль АДМИНИСТРАТОРА.', 'richardmy503@gmail.com';
    ELSE
        -- Выводим предупреждение, если пользователь не найден.
        RAISE NOTICE 'ПРЕДУПРЕЖДЕНИЕ: Пользователь с email % не найден. Роль администратора не присвоена.', 'richardmy503@gmail.com';
        RAISE NOTICE 'Пожалуйста, сначала зарегистрируйтесь с этим email, а затем выполните `supabase db reset` еще раз.';
    END IF;
END $$;


-- Финальное сообщение
SELECT 'База данных успешно наполнена тестовыми данными!' AS status;