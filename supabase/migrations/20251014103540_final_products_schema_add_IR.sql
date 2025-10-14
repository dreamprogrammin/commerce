-- Up Migration (Применение изменений)

-- 1. "Безопасное" создание таблицы 'brands'
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT
);

-- 2. "Безопасное" создание таблицы 'countries'
CREATE TABLE IF NOT EXISTS public.countries (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code CHAR(2) UNIQUE
);

-- 3. "Безопасное" добавление стран
-- ON CONFLICT (name) DO NOTHING - если страна с таким именем уже есть, ничего не делать
INSERT INTO public.countries (name, code) VALUES
('Россия', 'RU'), ('Китай', 'CN'), ('Германия', 'DE'),
('Беларусь', 'BY'), ('США', 'US'), ('Польша', 'PL'), ('Чехия', 'CZ'),
('Узбекистан', 'UZ'), ('Иран', 'IR')
ON CONFLICT (name) DO NOTHING;


-- 4. "Безопасное" изменение таблицы 'products'
-- Сначала проверим, существует ли каждая колонка, прежде чем ее добавлять

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.products'::regclass AND attname = 'sku') THEN
        ALTER TABLE public.products ADD COLUMN sku TEXT UNIQUE;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.products'::regclass AND attname = 'brand_id') THEN
        ALTER TABLE public.products ADD COLUMN brand_id UUID NULL REFERENCES public.brands(id);
    END IF;
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.products'::regclass AND attname = 'discount_percentage') THEN
        ALTER TABLE public.products ADD COLUMN discount_percentage NUMERIC(5, 2) DEFAULT 0 NOT NULL;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid = 'public.products'::regclass AND attname = 'origin_country_id') THEN
        ALTER TABLE public.products ADD COLUMN origin_country_id INTEGER NULL REFERENCES public.countries(id);
    END IF;
END;
$$;


-- Down Migration (Откат изменений) - оставляем как есть
ALTER TABLE public.products
DROP COLUMN IF EXISTS origin_country_id,
DROP COLUMN IF EXISTS discount_percentage,
DROP COLUMN IF EXISTS brand_id,
DROP COLUMN IF EXISTS sku;

DROP TABLE IF EXISTS public.countries;
DROP TABLE IF EXISTS public.brands;