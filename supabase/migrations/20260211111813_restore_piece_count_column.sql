-- Восстановление колонки piece_count (была удалена вручную через UI)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS piece_count INTEGER;

COMMENT ON COLUMN products.piece_count IS 'Количество деталей в конструкторе (для автоматического выбора диапазона)';

CREATE INDEX IF NOT EXISTS idx_products_piece_count ON products(piece_count) WHERE piece_count IS NOT NULL;
