-- Add color variant columns to products table
-- Date: 2026-06-19

ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS model_group_id TEXT,
ADD COLUMN IF NOT EXISTS color_hex TEXT,
ADD COLUMN IF NOT EXISTS color_name TEXT;

-- Create index for fast variant lookup
CREATE INDEX IF NOT EXISTS idx_products_model_group_id ON public.products(model_group_id) WHERE model_group_id IS NOT NULL;

COMMENT ON COLUMN public.products.model_group_id IS 'Common identifier linking product color variants (e.g., "mashinka-cada-123")';
COMMENT ON COLUMN public.products.color_hex IS 'HEX color code for UI display (e.g., "#FF0000")';
COMMENT ON COLUMN public.products.color_name IS 'Color name for tooltip (e.g., "Красный")';
