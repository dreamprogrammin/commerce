-- Migration: add_featured_products_fields
-- Description: Добавляет поддержку товаров дня для карусели на главной странице

-- Добавляем поле для выбора товаров дня
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT FALSE;

-- Добавляем поле для порядка показа
ALTER TABLE products ADD COLUMN IF NOT EXISTS featured_order INTEGER DEFAULT 0;

-- Создаём индекс для быстрой выборки
CREATE INDEX IF NOT EXISTS idx_products_featured 
ON products(is_featured, featured_order) 
WHERE is_featured = true;

-- Комментарии для документации
COMMENT ON COLUMN products.is_featured IS 'Флаг товара дня для отображения в карусели';
COMMENT ON COLUMN products.featured_order IS 'Порядок отображения в карусели (меньше = раньше)';