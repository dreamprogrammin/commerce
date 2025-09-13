-- Миграция для завершения перехода на систему галерей.
-- Мы удаляем устаревшую колонку `image_url` из таблицы `products`,
-- так как все изображения теперь хранятся в связанной таблице `product_images`.

-- Перед удалением, убедимся, что все старые данные перенесены.
-- Этот INSERT ... ON CONFLICT гарантирует, что мы не создадим дубликаты,
-- если этот код уже выполнялся.
INSERT INTO public.product_images (product_id, image_url, display_order)
SELECT id, image_url, 0
FROM public.products
WHERE image_url IS NOT NULL
ON CONFLICT DO NOTHING; -- Если запись для такого product_id уже есть, ничего не делать

-- Теперь, когда данные в безопасности, удаляем старую колонку.
ALTER TABLE public.products
DROP COLUMN IF EXISTS image_url;