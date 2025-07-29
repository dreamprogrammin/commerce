-- supabase/seed.sql
-- Этот файл заполняет вашу базу данных начальными данными для разработки.
-- Он выполняется после всех миграций при запуске `supabase db reset`.

-- Используем транзакцию, чтобы все команды выполнились успешно или не выполнились вовсе.
BEGIN;

-- Очищаем таблицу перед заполнением, чтобы избежать дубликатов при повторном запуске сидинга.
-- Это полезно, если вы меняете seed.sql и хотите быстро перезалить данные без полного ресета.
DELETE FROM public.menu_items;

-- Заполняем таблицу `menu_items`
-- Эти данные будут подгружаться в ваши выпадающие меню.
-- Поле `parent_slug` должно соответствовать `slug` из вашего файла `staticMainMenuItems.ts`

INSERT INTO public.menu_items (
    id, slug, title, href, description, parent_slug, display_order, image_url, icon_name, is_featured_on_homepage
) VALUES
-- ===============================================
-- === 1. ПОДКАТЕГОРИИ ДЛЯ "МАЛЬЧИКАМ" (parent_slug: 'boys') ===
-- ===============================================
(uuid_generate_v4(), 'boys-transport', 'Транспорт', '/catalog/boys/transport', 'Машинки, самолеты, поезда и другая техника.', 'boys', 1, 'boys/transport.jpg', null, true),
(uuid_generate_v4(), 'boys-lego', 'Конструкторы LEGO', '/catalog/boys/lego', 'Наборы LEGO City, Technic, Star Wars.', 'boys', 2, 'boys/lego.jpg', null, true),
(uuid_generate_v4(), 'boys-robots', 'Роботы и трансформеры', '/catalog/boys/robots', 'Интерактивные роботы и знаменитые трансформеры.', 'boys', 3, 'boys/robots.jpg', null, false),
(uuid_generate_v4(), 'boys-superheroes', 'Супергерои', '/catalog/boys/superheroes', 'Фигурки Marvel, DC и других вселенных.', 'boys', 4, 'boys/superheroes.jpg', null, true),

-- ===============================================
-- === 2. ПОДКАТЕГОРИИ ДЛЯ "ДЕВОЧКАМ" (parent_slug: 'girls') ===
-- ===============================================
(uuid_generate_v4(), 'girls-dolls', 'Куклы и пупсы', '/catalog/girls/dolls', 'Классические куклы, пупсы и аксессуары к ним.', 'girls', 1, 'girls/dolls.jpg', null, true),
(uuid_generate_v4(), 'girls-dollhouses', 'Кукольные домики', '/catalog/girls/dollhouses', 'Домики и мебель для кукол.', 'girls', 2, 'girls/dollhouses.jpg', null, false),
(uuid_generate_v4(), 'girls-creative-kits', 'Наборы для творчества', '/catalog/girls/creative-kits', 'Создание украшений, рисование, лепка.', 'girls', 3, 'girls/creative-kits.jpg', null, true),
(uuid_generate_v4(), 'girls-plush-toys', 'Мягкие игрушки', '/catalog/girls/plush-toys', 'Милые и пушистые друзья для вашей девочки.', 'girls', 4, 'girls/plush-toys.jpg', null, false),

-- ===============================================
-- === 3. ПОДКАТЕГОРИИ ДЛЯ "МАЛЫШАМ" (parent_slug: 'kiddy') ===
-- ===============================================
(uuid_generate_v4(), 'kiddy-sorters', 'Сортеры и пирамидки', '/catalog/kiddy/sorters', 'Развивают логику и моторику.', 'kiddy', 1, 'kiddy/sorters.jpg', null, true),
(uuid_generate_v4(), 'kiddy-cubes', 'Кубики', '/catalog/kiddy/cubes', 'Деревянные и мягкие кубики для самых маленьких.', 'kiddy', 2, 'kiddy/cubes.jpg', null, false),
(uuid_generate_v4(), 'kiddy-mobiles', 'Мобили и подвески', '/catalog/kiddy/mobiles', 'Для кроваток и колясок.', 'kiddy', 3, null, null, false),

-- ===============================================
-- === 4. ПОДКАТЕГОРИИ ДЛЯ "ИГРЫ" (parent_slug: 'games') ===
-- ===============================================
(uuid_generate_v4(), 'games-board', 'Настольные игры', '/catalog/games/board', 'Для всей семьи и веселых компаний.', 'games', 1, 'games/board.jpg', null, true),
(uuid_generate_v4(), 'games-puzzles', 'Пазлы', '/catalog/games/puzzles', 'От 100 до 5000 деталей.', 'games', 2, 'games/puzzles.jpg', null, false),
(uuid_generate_v4(), 'games-educational', 'Обучающие игры', '/catalog/games/educational', 'Изучаем буквы, цифры и окружающий мир.', 'games', 3, null, null, false),

-- ===============================================
-- === 5. ПОДКАТЕГОРИИ ДЛЯ "РАЗВИВАШКИ" (parent_slug: 'razvivashki') ===
-- ===============================================
-- Допустим, здесь пока нет подкатегорий, чтобы протестировать сообщение "Скоро здесь появятся подкатегории..."

-- ===============================================
-- === 6. ТРЕТИЙ УРОВЕНЬ ВЛОЖЕННОСТИ (пример) ===
-- === Дочерние элементы для "Транспорт" (parent_slug: 'boys-transport')
-- ===============================================
(uuid_generate_v4(), 'boys-transport-cars', 'Машинки', '/catalog/boys/transport/cars', null, 'boys-transport', 1, null, null, false),
(uuid_generate_v4(), 'boys-transport-trains', 'Железные дороги', '/catalog/boys/transport/trains', null, 'boys-transport', 2, null, null, false),
(uuid_generate_v4(), 'boys-transport-planes', 'Самолеты и вертолеты', '/catalog/boys/transport/planes', null, 'boys-transport', 3, null, null, false);

COMMIT;