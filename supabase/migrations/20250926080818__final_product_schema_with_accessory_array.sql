-- migration.sql
-- Название: final_product_schema_with_accessory_array

-- Шаг 1: Полностью удаляем все сущности, от которых мы отказались.
DROP TABLE IF EXISTS public.product_accessories;
DROP TABLE IF EXISTS public.product_types;

-- Шаг 2: Модифицируем таблицу 'products', удаляя старые колонки и добавляя новую.
ALTER TABLE public.products
DROP COLUMN IF EXISTS product_type,
DROP COLUMN IF EXISTS custom_fields_data,
ADD COLUMN IF NOT EXISTS accessory_ids UUID[] NULL; -- Тип "массив UUID"

-- Шаг 3: Добавляем/обновляем комментарий к новой колонке.
COMMENT ON COLUMN public.products.accessory_ids IS 'Массив ID сопутствующих товаров (аксессуаров).';

-- Шаг 4 (Опционально, но рекомендуется): Добавляем флаг 'is_accessory'.
-- Это не Способ 2, а лишь маленькое дополнение к Способу 1 для удобства фильтрации в админке.
-- Оно не будет управлять логикой поиска, но поможет администратору видеть, что есть что.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS is_accessory BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.is_accessory IS 'Отмечает товары, которые в основном используются как аксессуары (для удобства фильтрации в админке).';
