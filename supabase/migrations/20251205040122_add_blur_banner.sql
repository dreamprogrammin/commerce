-- Migration: Add blur_data_url to banners table
-- Description: Добавляет поле для хранения размытого превью изображения (LQIP)
-- Created: 2024-12-05

-- Добавляем колонку blur_data_url
ALTER TABLE public.banners 
ADD COLUMN IF NOT EXISTS blur_data_url TEXT;

-- Добавляем комментарий к колонке
COMMENT ON COLUMN public.banners.blur_data_url IS 
'Base64-encoded blurred preview image for LQIP (Low Quality Image Placeholder). Size ~20x20px, JPEG quality 50%.';