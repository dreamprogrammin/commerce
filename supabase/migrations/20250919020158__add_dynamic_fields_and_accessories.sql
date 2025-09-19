-- migration.sql
-- Название: create_product_types_with_dynamic_fields_and_accessories

-- Шаг 1: Очистка. Удаляем старые и временные колонки из таблицы 'products'.
-- Это гарантирует, что мы начинаем с чистого листа.
ALTER TABLE public.products
DROP COLUMN IF EXISTS type; -- Удаляем старую колонку 'type'

-- Шаг 2: Создание новой таблицы-справочника 'product_types'.
-- Она будет хранить все возможные типы товаров и схему их доп. полей.
CREATE TABLE IF NOT EXISTS public.product_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    custom_fields_schema JSONB NULL, -- Здесь будет храниться JSON-схема полей
    display_order INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Шаг 3: Модификация основной таблицы 'products'.
-- Добавляем колонки для связи с типом и для хранения данных кастомных полей.
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_type TEXT NULL, -- Для хранения slug'а из product_types
ADD COLUMN IF NOT EXISTS custom_fields_data JSONB NULL; -- Для хранения значений кастомных полей

-- Устанавливаем связь (внешний ключ) между 'products' и 'product_types'.
-- Сначала удаляем старый constraint, если он вдруг существует, чтобы избежать ошибок.
ALTER TABLE public.products
DROP CONSTRAINT IF EXISTS products_product_type_fkey;

ALTER TABLE public.products
ADD CONSTRAINT products_product_type_fkey
FOREIGN KEY (product_type) REFERENCES public.product_types (slug)
ON DELETE SET NULL -- Если тип удалят, у товара это поле просто станет пустым
ON UPDATE CASCADE; -- Если slug типа изменится, он обновится и в товарах

-- Шаг 4: Создание связующей таблицы 'product_accessories' (многие-ко-многим).
CREATE TABLE IF NOT EXISTS public.product_accessories (
    main_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    accessory_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (main_product_id, accessory_product_id)
);

-- Шаг 5: Добавление комментариев и индексов для удобства и производительности.
COMMENT ON TABLE public.product_types IS 'Справочник типов товаров, используемых для категоризации и определения динамических полей.';
COMMENT ON COLUMN public.product_types.custom_fields_schema IS 'JSON-схема для динамических полей. Пример: {"needs_batteries": {"label": "Требуются батарейки?", "type": "boolean"}}';

COMMENT ON COLUMN public.products.product_type IS 'Внешний ключ (slug) к таблице product_types.';
COMMENT ON COLUMN public.products.custom_fields_data IS 'JSON-объект, хранящий значения для полей, определенных в product_types.custom_fields_schema.';

COMMENT ON TABLE public.product_accessories IS 'Связующая таблица для сопутствующих товаров (аксессуаров).';

-- Индексы для ускорения поиска
CREATE INDEX IF NOT EXISTS products_product_type_idx ON public.products (product_type);
CREATE INDEX IF NOT EXISTS product_accessories_main_product_id_idx ON public.product_accessories (main_product_id);
CREATE INDEX IF NOT EXISTS product_accessories_accessory_product_id_idx ON public.product_accessories (accessory_product_id);