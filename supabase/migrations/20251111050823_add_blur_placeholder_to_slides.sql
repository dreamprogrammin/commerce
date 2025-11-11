-- Добавить поле blur_placeholder в таблицу slides
ALTER TABLE public.slides 
ADD COLUMN IF NOT EXISTS blur_placeholder TEXT NULL;

-- Добавить комментарий
COMMENT ON COLUMN public.slides.blur_placeholder IS 'Base64 blur placeholder for LQIP (Low-Quality Image Placeholder)';