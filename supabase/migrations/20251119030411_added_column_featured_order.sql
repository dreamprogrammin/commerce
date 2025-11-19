-- Добавляем колонку featured_order в таблицу categories
-- Значение по умолчанию 0 = small карточка

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT 0;

-- Добавляем комментарий для документации
COMMENT ON COLUMN categories.featured_order IS 
'Определяет размер карточки в масонри-сетке каталога:
0-33: small (обычная карточка, 1 колонка)
34-66: medium (средняя карточка, 1 колонка, высокая)
67-100: large (большая карточка, 2 колонки)';

-- Опционально: добавляем индекс если будете сортировать по этому полю
CREATE INDEX IF NOT EXISTS idx_categories_featured_order 
ON categories(featured_order DESC);

-- Опционально: устанавливаем значения для существующих featured категорий
-- Делаем их "большими" по умолчанию
UPDATE categories 
SET featured_order = 80 
WHERE is_featured = true AND featured_order = 0;