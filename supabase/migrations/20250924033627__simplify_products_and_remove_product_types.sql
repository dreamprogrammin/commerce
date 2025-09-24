-- migration.sql
-- Название: simplify_products_and_remove_product_types

-- Шаг 1: Удаляем колонки из таблицы 'products', связанные со старой системой.
-- Сначала удаляем внешний ключ, который на них ссылается.
ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_product_type_fkey;

ALTER TABLE public.products
DROP COLUMN IF EXISTS product_type,
DROP COLUMN IF EXISTS custom_fields_data;

-- Шаг 2: Удаляем таблицу 'product_types', она нам больше не нужна.
DROP TABLE IF EXISTS public.product_types;

-- Шаг 3 (Проверка): Убедимся, что таблица 'product_accessories' и ее связи на месте.
-- Этот код ничего не меняет, он просто для вашей уверенности, что связи корректны.
-- Если вы выполняли предыдущую миграцию, эти связи уже должны быть правильными.

-- Удаляем старые, чтобы избежать конфликтов
ALTER TABLE public.product_accessories
DROP CONSTRAINT IF EXISTS product_accessories_main_product_id_fkey,
DROP CONSTRAINT IF EXISTS product_accessories_accessory_product_id_fkey;

-- Создаем заново правильные, именованные связи
ALTER TABLE public.product_accessories
ADD CONSTRAINT product_accessories_main_product_id_fkey
FOREIGN KEY (main_product_id) REFERENCES public.products(id)
ON DELETE CASCADE;

ALTER TABLE public.product_accessories
ADD CONSTRAINT product_accessories_accessory_product_id_fkey
FOREIGN KEY (accessory_product_id) REFERENCES public.products(id)
ON DELETE CASCADE;