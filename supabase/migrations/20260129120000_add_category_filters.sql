-- Добавляем поля для фильтрации категорий по брендам и линейкам
-- Это позволит настроить автоматическую фильтрацию товаров в категории

-- Разрешенные бренды для категории (если null - показываем все бренды)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS allowed_brand_ids UUID[];

-- Разрешенные линейки продуктов для категории (если null - показываем все линейки)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS allowed_product_line_ids UUID[];

COMMENT ON COLUMN categories.allowed_brand_ids IS 'Массив ID брендов, которые разрешены в этой категории. NULL = все бренды';
COMMENT ON COLUMN categories.allowed_product_line_ids IS 'Массив ID линеек продуктов, которые разрешены в этой категории. NULL = все линейки';

-- Индексы для быстрой фильтрации
CREATE INDEX IF NOT EXISTS idx_categories_allowed_brands ON categories USING GIN (allowed_brand_ids);
CREATE INDEX IF NOT EXISTS idx_categories_allowed_product_lines ON categories USING GIN (allowed_product_line_ids);
