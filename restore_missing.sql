-- 🚨 УМНЫЙ СКРИПТ: Восстанавливает только отсутствующие категории и бренды
-- Использует ON CONFLICT DO NOTHING - не перезаписывает существующие записи

-- ============================================
-- ЧАСТЬ 0: ИСПРАВЛЕНИЕ СУЩЕСТВУЮЩИХ ОШИБОК
-- ============================================

-- Переименовываем 'constructors' в 'constructors-root' только если 'constructors-root' не существует
UPDATE categories 
SET slug = 'constructors-root' 
WHERE slug = 'constructors'
  AND NOT EXISTS (SELECT 1 FROM categories WHERE slug = 'constructors-root');

-- ============================================
-- ЧАСТЬ 1: БРЕНДЫ
-- ============================================

-- Топ-бренды
INSERT INTO brands (name, slug) VALUES
('LEGO', 'lego'),
('Mattel', 'mattel'),
('LOL Surprise', 'lol-surprise'),
('BOWA', 'bowa'),
('Sluban', 'sluban'),
('CADA', 'cada')
ON CONFLICT (slug) DO NOTHING;

-- Средние бренды
INSERT INTO brands (name, slug) VALUES
('MG Toys', 'mg-toys'),
('Play Smart', 'play-smart'),
('Feelo', 'feelo'),
('Gudi', 'gudi'),
('Shantou Yisheng', 'shantou-yisheng'),
('FiveStar Toys', 'fivestar-toys'),
('My Little Home', 'my-litle-home'),
('MokaToys', 'mokatoys'),
('Eva Puzzle', 'eva-puzzle'),
('Huanger', 'huanger'),
('Koala Diary', 'koala-diary'),
('Mermaze', 'mermaze'),
('RC Toys', 'rc-toys'),
('Hola Toys', 'hola-toys'),
('Polese', 'polese')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ЧАСТЬ 2: КОРНЕВЫЕ КАТЕГОРИИ
-- ============================================

INSERT INTO categories (name, slug, href, parent_id, display_order) VALUES
('Мальчикам', 'boys', '/catalog/boys', NULL, 1),
('Девочкам', 'girls', '/catalog/girls', NULL, 2),
('Малышам', 'kiddy', '/catalog/kiddy', NULL, 3),
('Младенцам', 'babies', '/catalog/babies', NULL, 4),
('Конструкторы', 'constructors-root', '/catalog/constructors-root', NULL, 5),
('Творчество', 'creativity', '/catalog/creativity', NULL, 6),
('Игры', 'games', '/catalog/games', NULL, 7),
('Игры', 'play', '/catalog/play', NULL, 8),
('Праздники', 'holyday', '/catalog/holyday', NULL, 9),
('Мягкие игрушки', 'myagkie-igrushki', '/catalog/myagkie-igrushki', NULL, 10),
('Аксессуары', 'accessories', '/catalog/accessories', NULL, 11)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ЧАСТЬ 3: ПОДКАТЕГОРИИ 1 УРОВНЯ
-- ============================================

-- Мальчикам
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Машинки', 'mashinki', '/catalog/boys/mashinki', id, 1 FROM categories WHERE slug = 'boys'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Ролевые и сюжетные наборы', 'rolevye-i-syuzhetnye-nabory', '/catalog/boys/rolevye-i-syuzhetnye-nabory', id, 2 FROM categories WHERE slug = 'boys'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Игрушечное оружие', 'igrushechnoe-oruzhie', '/catalog/boys/igrushechnoe-oruzhie', id, 3 FROM categories WHERE slug = 'boys'
ON CONFLICT (slug) DO NOTHING;

-- Девочкам
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Куклы', 'kukly', '/catalog/girls/kukly', id, 1 FROM categories WHERE slug = 'girls'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Игровые наборы для девочек', 'igrovye-nabory-dlya-devochek', '/catalog/girls/igrovye-nabory-dlya-devochek', id, 2 FROM categories WHERE slug = 'girls'
ON CONFLICT (slug) DO NOTHING;

-- Малышам
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Бизиборды', 'bizibordy', '/catalog/kiddy/bizibordy', id, 1 FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Толокар', 'tolokar', '/catalog/kiddy/tolokar', id, 2 FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Каталки', 'katalki', '/catalog/kiddy/katalki', id, 3 FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Коврики', 'kovriki', '/catalog/kiddy/kovriki', id, 4 FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

-- Младенцам
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Плюшевые игрушки', 'plyushevye-igrushki', '/catalog/babies/plyushevye-igrushki', id, 1 FROM categories WHERE slug = 'babies'
ON CONFLICT (slug) DO NOTHING;

-- Конструкторы
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Конструкторы мальчикам', 'konstruktory-malchikam', '/catalog/constructors-root/konstruktory-malchikam', id, 1 FROM categories WHERE slug = 'constructors-root'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Конструкторы девочкам', 'konstruktory-devochkam', '/catalog/constructors-root/konstruktory-devochkam', id, 2 FROM categories WHERE slug = 'constructors-root'
ON CONFLICT (slug) DO NOTHING;

-- Аксессуары
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Батарейки', 'batteries', '/catalog/accessories/batteries', id, 1 FROM categories WHERE slug = 'accessories'
ON CONFLICT (slug) DO NOTHING;

-- Игры
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Настольные игры', 'board-games', '/catalog/play/board-games', id, 1 FROM categories WHERE slug = 'play'
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ЧАСТЬ 4: ПОДКАТЕГОРИИ 2 УРОВНЯ
-- ============================================

-- Машинки
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Радиоуправляемые машинки', 'radioupravlyaemye-mashinki', '/catalog/boys/mashinki/radioupravlyaemye-mashinki', id, 1 FROM categories WHERE slug = 'mashinki'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Металлические машинки', 'metallicheskie-mashinki', '/catalog/boys/mashinki/metallicheskie-mashinki', id, 2 FROM categories WHERE slug = 'mashinki'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Автотреки', 'avtotreki', '/catalog/boys/mashinki/avtotreki', id, 3 FROM categories WHERE slug = 'mashinki'
ON CONFLICT (slug) DO NOTHING;

-- Игрушечное оружие
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Игрушечные автоматы', 'igrushechnye-avtomaty', '/catalog/boys/igrushechnoe-oruzhie/igrushechnye-avtomaty', id, 1 FROM categories WHERE slug = 'igrushechnoe-oruzhie'
ON CONFLICT (slug) DO NOTHING;

-- Куклы
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Куклы аксессуары', 'kukly-aksessuary', '/catalog/girls/kukly/kukly-aksessuary', id, 1 FROM categories WHERE slug = 'kukly'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Интерактивные куклы', 'interaktivnye-kukly', '/catalog/girls/kukly/interaktivnye-kukly', id, 2 FROM categories WHERE slug = 'kukly'
ON CONFLICT (slug) DO NOTHING;

-- Бизиборды
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Бизикубы', 'bizikub', '/catalog/kiddy/bizibordy/bizikub', id, 1 FROM categories WHERE slug = 'bizibordy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Бизидомики', 'bizidomiki', '/catalog/kiddy/bizibordy/bizidomiki', id, 2 FROM categories WHERE slug = 'bizibordy'
ON CONFLICT (slug) DO NOTHING;

INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Бизидоски', 'bizidoski', '/catalog/kiddy/bizibordy/bizidoski', id, 3 FROM categories WHERE slug = 'bizibordy'
ON CONFLICT (slug) DO NOTHING;

-- Коврики
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 'Коврики-пазлы', 'kovriki-pazly', '/catalog/kiddy/kovriki/kovriki-pazly', id, 1 FROM categories WHERE slug = 'kovriki'
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ПРОВЕРКА: Что было добавлено
-- ============================================

-- Показать все бренды
SELECT 
  name as "Бренд",
  slug as "Slug"
FROM brands
ORDER BY name;

-- Показать структуру категорий
SELECT 
  COALESCE(c1.name, '—') as "Корневая",
  COALESCE(c2.name, '—') as "Уровень 1",
  COALESCE(c3.name, '—') as "Уровень 2",
  c3.slug as "Slug"
FROM categories c3
LEFT JOIN categories c2 ON c3.parent_id = c2.id
LEFT JOIN categories c1 ON c2.parent_id = c1.id
ORDER BY 
  COALESCE(c1.display_order, 999),
  COALESCE(c2.display_order, 999),
  c3.display_order;

-- Подсчет
SELECT 
  'Брендов' as "Тип",
  COUNT(*) as "Количество"
FROM brands
UNION ALL
SELECT 
  'Категорий',
  COUNT(*)
FROM categories;
