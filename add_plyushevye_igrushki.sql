-- ============================================
-- Восстановление категории "Плюшевые игрушки"
-- Рядом с "kovriki" внутри "kiddy"
-- ============================================

-- Шаг 1: Удалить все существующие записи с этим slug
DELETE FROM categories 
WHERE slug = 'plyushevye-igrushki';

-- Шаг 2: Создать категорию рядом с "kovriki" (внутри "kiddy")
INSERT INTO categories (name, slug, href, parent_id, display_order)
SELECT 
  'Плюшевые игрушки',
  'plyushevye-igrushki',
  '/catalog/kiddy/plyushevye-igrushki',
  id,
  5
FROM categories 
WHERE slug = 'kiddy';

-- Проверка: показать созданную категорию
SELECT 
  c1.name as "Корневая",
  c2.name as "Уровень 1", 
  c2.slug as "Slug",
  c2.href as "URL"
FROM categories c2
LEFT JOIN categories c1 ON c2.parent_id = c1.id
WHERE c2.slug = 'plyushevye-igrushki';
