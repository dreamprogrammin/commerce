-- ============================================================================
-- СИНХРОНИЗАЦИЯ НЕДОСТАЮЩИХ ТАБЛИЦ ИЗ ПРОДАКШЕНА
-- ============================================================================
-- Добавляет таблицы, которые есть в продакшене, но отсутствуют в локалке
-- ============================================================================

-- Таблица: product_types (из продакшена)
CREATE TABLE IF NOT EXISTS public.product_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    custom_fields_schema JSONB,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.product_types OWNER TO postgres;

COMMENT ON TABLE public.product_types IS 'Справочник типов товаров, используемых для категоризации и определения динамических полей.';
COMMENT ON COLUMN public.product_types.custom_fields_schema IS 'JSON-схема для динамических полей. Пример: {"needs_batteries": {"label": "Требуются батарейки?", "type": "boolean"}}';

-- Таблица: product_accessories (из продакшена)
CREATE TABLE IF NOT EXISTS public.product_accessories (
    main_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    accessory_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc', now()) NOT NULL,
    PRIMARY KEY (main_product_id, accessory_product_id)
);

ALTER TABLE public.product_accessories OWNER TO postgres;

COMMENT ON TABLE public.product_accessories IS 'Связующая таблица для сопутствующих товаров (аксессуаров).';

-- Создаём индексы
CREATE INDEX IF NOT EXISTS idx_product_accessories_main ON public.product_accessories(main_product_id);
CREATE INDEX IF NOT EXISTS idx_product_accessories_accessory ON public.product_accessories(accessory_product_id);

-- RLS политики для публичного чтения
ALTER TABLE public.product_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_accessories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access for product_types" ON public.product_types;
CREATE POLICY "Allow public read access for product_types"
    ON public.product_types FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow public read access for product_accessories" ON public.product_accessories;
CREATE POLICY "Allow public read access for product_accessories"
    ON public.product_accessories FOR SELECT
    USING (true);

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
