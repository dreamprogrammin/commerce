-- Add piece_count field to products table
-- This field stores the exact number of pieces/parts in a construction toy
-- It will be used to automatically select the appropriate number_range attribute option

ALTER TABLE products
ADD COLUMN piece_count INTEGER;

-- Add comment to explain the field
COMMENT ON COLUMN products.piece_count IS 'Количество деталей в конструкторе (для автоматического выбора диапазона)';

-- Create index for filtering by piece count
CREATE INDEX idx_products_piece_count ON products(piece_count) WHERE piece_count IS NOT NULL;
