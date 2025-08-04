-- supabase/seed.sql
-- Этот файл заполняет базу тестовыми данными после каждой миграции.

-- 1. Удаляем все старые данные из таблиц, чтобы избежать дубликатов при повторных запусках.
-- (ВАЖНО: Это безопасно только для seed-файла, никогда не делайте так в миграциях!)
DELETE FROM public.categories;
-- DELETE FROM public.products; -- Можете раскомментировать, если добавите тестовые товары

-- 2. Создаем наши корневые категории, которые будут служить точками входа в меню.
-- Это аналог твоего старого файла staticMainMenuItems.
INSERT INTO public.categories 
    (name, slug, href, description, is_root_category, display_order, icon_name)
VALUES
    ('Мальчикам', 'boys', '/catalog/boys', 'Все для мальчиков', TRUE, 1, 'lucide:user'),
    ('Девочкам', 'girls', '/catalog/girls', 'Все для девочек', TRUE, 2, 'lucide:female'),
    ('Малышам', 'kiddy', '/catalog/kiddy', 'Для самых маленьких', TRUE, 3, 'lucide:baby'),
    ('Игры', 'games', '/catalog/games', 'Развивающие и настольные игры', TRUE, 4, 'lucide:gamepad-2'),
    ('Развивашки', 'razvivashki', '/catalog/razvivashki', 'Все для развития', TRUE, 5, 'lucide:brain-circuit');

-- 3. (Пример) Создаем подкатегорию для "Мальчиков"
-- Сначала нам нужно получить ID родительской категории "boys"
INSERT INTO public.categories
    (name, slug, href, description, parent_id, display_order)
VALUES
    ('Машинки', 'cars', '/catalog/boys/cars', 'Все виды машинок', (SELECT id FROM public.categories WHERE slug = 'boys'), 1),
    ('Конструкторы', 'constructors', '/catalog/boys/constructors', 'Лего и аналоги', (SELECT id FROM public.categories WHERE slug = 'boys'), 2);

-- 4. (Пример) Создаем тестовый товар в категории "Машинки"
INSERT INTO public.products
    (name, slug, description, price, category_id, stock_quantity, bonus_points_award)
VALUES
    ('Гоночный болид "Молния"', 'racing-car-lightning', 'Супер-быстрая гоночная машинка красного цвета.', 1500.00, (SELECT id FROM public.categories WHERE slug = 'cars'), 50, 75);