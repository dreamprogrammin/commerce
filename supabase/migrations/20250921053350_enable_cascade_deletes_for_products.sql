-- migration.sql
-- Название: enable_cascade_deletes_for_products

-- 1. Обновляем связь для таблицы 'product_images'
-- Сначала удаляем старое правило связи
ALTER TABLE public.product_images
DROP CONSTRAINT IF EXISTS product_images_product_id_fkey;

-- Затем добавляем новое правило с ON DELETE CASCADE
ALTER TABLE public.product_images
ADD CONSTRAINT product_images_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id)
ON DELETE CASCADE; -- <-- Вот магия!

-- 2. Обновляем связи для таблицы 'product_accessories'

-- Для колонки 'main_product_id'
ALTER TABLE public.product_accessories
DROP CONSTRAINT IF EXISTS product_accessories_main_product_id_fkey;

ALTER TABLE public.product_accessories
ADD CONSTRAINT product_accessories_main_product_id_fkey
FOREIGN KEY (main_product_id) REFERENCES public.products(id)
ON DELETE CASCADE; -- <-- Вот магия!

-- Для колонки 'accessory_product_id'
ALTER TABLE public.product_accessories
DROP CONSTRAINT IF EXISTS product_accessories_accessory_product_id_fkey;

ALTER TABLE public.product_accessories
ADD CONSTRAINT product_accessories_accessory_product_id_fkey
FOREIGN KEY (accessory_product_id) REFERENCES public.products(id)
ON DELETE CASCADE; -- <-- Вот магия!