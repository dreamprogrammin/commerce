-- 🎨 Миграция: Добавление blur placeholder для LQIP
-- Дата: 2025-01-03
-- Описание: Добавляет поле blur_placeholder в product_images для хранения base64 превью

-- Добавляем колонку blur_placeholder
ALTER TABLE product_images
ADD COLUMN IF NOT EXISTS blur_placeholder TEXT NULL;

-- Комментарий к колонке
COMMENT ON COLUMN product_images.blur_placeholder IS 'Base64 data URL крошечного blur preview изображения для LQIP (Low-Quality Image Placeholder). Размер ~1-3KB';

-- Создаем индекс для быстрого поиска изображений с placeholder
CREATE INDEX IF NOT EXISTS idx_product_images_has_blur 
ON product_images (product_id) 
WHERE blur_placeholder IS NOT NULL;

-- Пример использования:
-- UPDATE product_images 
-- SET blur_placeholder = 'data:image/jpeg;base64,/9j/4AAQ...' 
-- WHERE id = 'some-uuid';