-- 🚨 СКРИПТ ДЛЯ БЫСТРОГО СОЗДАНИЯ КРИТИЧНЫХ КАТЕГОРИЙ
-- Используй этот скрипт ТОЛЬКО если хочешь создать категории через SQL
-- Рекомендуется создавать через админку для заполнения всех полей

-- ============================================
-- 1. КОРНЕВЫЕ КАТЕГОРИИ (parent_id = NULL)
-- ============================================

-- Мальчикам
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Мальчикам', 'boys', NULL, true, 1)
ON CONFLICT (slug) DO NOTHING;

-- Девочкам
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Девочкам', 'girls', NULL, true, 2)
ON CONFLICT (slug) DO NOTHING;

-- Малышам
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Малышам', 'kiddy', NULL, true, 3)
ON CONFLICT (slug) DO NOTHING;

-- Младенцам
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Младенцам', 'babies', NULL, true, 4)
ON CONFLICT (slug) DO NOTHING;

-- Конструкторы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Конструкторы', 'constructors-root', NULL, true, 5)
ON CONFLICT (slug) DO NOTHING;

-- Творчество
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Творчество', 'creativity', NULL, true, 6)
ON CONFLICT (slug) DO NOTHING;

-- Игры
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Игры', 'games', NULL, true, 7)
ON CONFLICT (slug) DO NOTHING;

-- Праздники
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Праздники', 'holyday', NULL, true, 8)
ON CONFLICT (slug) DO NOTHING;

-- Мягкие игрушки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Мягкие игрушки', 'myagkie-igrushki', NULL, true, 9)
ON CONFLICT (slug) DO NOTHING;

-- Аксессуары
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
VALUES ('Аксессуары', 'accessories', NULL, true, 10)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 2. ПОДКАТЕГОРИИ ПЕРВОГО УРОВНЯ
-- ============================================

-- Мальчикам → Машинки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Машинки', 'mashinki', id, true, 1
FROM categories WHERE slug = 'boys'
ON CONFLICT (slug) DO NOTHING;

-- Мальчикам → Ролевые и сюжетные наборы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Ролевые и сюжетные наборы', 'rolevye-i-syuzhetnye-nabory', id, true, 2
FROM categories WHERE slug = 'boys'
ON CONFLICT (slug) DO NOTHING;

-- Мальчикам → Игрушечное оружие
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Игрушечное оружие', 'igrushechnoe-oruzhie', id, true, 3
FROM categories WHERE slug = 'boys'
ON CONFLICT (slug) DO NOTHING;

-- Девочкам → Куклы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Куклы', 'kukly', id, true, 1
FROM categories WHERE slug = 'girls'
ON CONFLICT (slug) DO NOTHING;

-- Девочкам → Игровые наборы для девочек
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Игровые наборы для девочек', 'igrovye-nabory-dlya-devochek', id, true, 2
FROM categories WHERE slug = 'girls'
ON CONFLICT (slug) DO NOTHING;

-- Малышам → Бизиборды
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Бизиборды', 'bizibordy', id, true, 1
FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

-- Малышам → Толокар
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Толокар', 'tolokar', id, true, 2
FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

-- Малышам → Каталки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Каталки', 'katalki', id, true, 3
FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

-- Малышам → Коврики
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Коврики', 'kovriki', id, true, 4
FROM categories WHERE slug = 'kiddy'
ON CONFLICT (slug) DO NOTHING;

-- Младенцам → Плюшевые игрушки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Плюшевые игрушки', 'plyushevye-igrushki', id, true, 1
FROM categories WHERE slug = 'babies'
ON CONFLICT (slug) DO NOTHING;

-- Конструкторы → Конструкторы мальчикам
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Конструкторы мальчикам', 'konstruktory-malchikam', id, true, 1
FROM categories WHERE slug = 'constructors-root'
ON CONFLICT (slug) DO NOTHING;

-- Конструкторы → Конструкторы девочкам
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Конструкторы девочкам', 'konstruktory-devochkam', id, true, 2
FROM categories WHERE slug = 'constructors-root'
ON CONFLICT (slug) DO NOTHING;

-- Аксессуары → Батарейки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Батарейки', 'batteries', id, true, 1
FROM categories WHERE slug = 'accessories'
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- 3. ПОДКАТЕГОРИИ ВТОРОГО УРОВНЯ
-- ============================================

-- Машинки → Радиоуправляемые машинки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Радиоуправляемые машинки', 'radioupravlyaemye-mashinki', id, true, 1
FROM categories WHERE slug = 'mashinki'
ON CONFLICT (slug) DO NOTHING;

-- Машинки → Металлические машинки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Металлические машинки', 'metallicheskie-mashinki', id, true, 2
FROM categories WHERE slug = 'mashinki'
ON CONFLICT (slug) DO NOTHING;

-- Машинки → Автотреки
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Автотреки', 'avtotreki', id, true, 3
FROM categories WHERE slug = 'mashinki'
ON CONFLICT (slug) DO NOTHING;

-- Игрушечное оружие → Игрушечные автоматы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Игрушечные автоматы', 'igrushechnye-avtomaty', id, true, 1
FROM categories WHERE slug = 'igrushechnoe-oruzhie'
ON CONFLICT (slug) DO NOTHING;

-- Куклы → Куклы аксессуары
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Куклы аксессуары', 'kukly-aksessuary', id, true, 1
FROM categories WHERE slug = 'kukly'
ON CONFLICT (slug) DO NOTHING;

-- Куклы → Интерактивные куклы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Интерактивные куклы', 'interaktivnye-kukly', id, true, 2
FROM categories WHERE slug = 'kukly'
ON CONFLICT (slug) DO NOTHING;

-- Бизиборды → Бизикубы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Бизикубы', 'bizikub', id, true, 1
FROM categories WHERE slug = 'bizibordy'
ON CONFLICT (slug) DO NOTHING;

-- Бизиборды → Бизидомики
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Бизидомики', 'bizidomiki', id, true, 2
FROM categories WHERE slug = 'bizibordy'
ON CONFLICT (slug) DO NOTHING;

-- Бизиборды → Бизидоски
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Бизидоски', 'bizidoski', id, true, 3
FROM categories WHERE slug = 'bizibordy'
ON CONFLICT (slug) DO NOTHING;

-- Коврики → Коврики-пазлы
INSERT INTO categories (name, slug, parent_id, is_active, display_order)
SELECT 'Коврики-пазлы', 'kovriki-pazly', id, true, 1
FROM categories WHERE slug = 'kovriki'
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- ПРОВЕРКА
-- ============================================

-- Проверить созданные категории
SELECT 
  c1.name as "Корневая",
  c2.name as "Подкатегория 1",
  c3.name as "Подкатегория 2",
  c3.slug as "Slug"
FROM categories c3
LEFT JOIN categories c2 ON c3.parent_id = c2.id
LEFT JOIN categories c1 ON c2.parent_id = c1.id
WHERE c3.is_active = true
ORDER BY c1.display_order, c2.display_order, c3.display_order;
