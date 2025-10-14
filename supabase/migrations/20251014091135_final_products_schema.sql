-- Up Migration (Применение изменений)

-- 1. Создание таблицы 'brands'
CREATE TABLE public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT
);

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.brands FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for admins" ON public.brands FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Enable update for admins" ON public.brands FOR UPDATE USING (public.is_admin());
CREATE POLICY "Enable delete for admins" ON public.brands FOR DELETE USING (public.is_admin());


-- 2. Создание таблицы 'countries'
CREATE TABLE public.countries (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    code CHAR(2) UNIQUE
);

ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.countries FOR SELECT USING (TRUE);
CREATE POLICY "Enable insert for admins" ON public.countries FOR INSERT WITH CHECK (public.is_admin());
CREATE POLICY "Enable update for admins" ON public.countries FOR UPDATE USING (public.is_admin());
CREATE POLICY "Enable delete for admins" ON public.countries FOR DELETE USING (public.is_admin());

-- 3. Наполнение таблицы 'countries' базовыми значениями
INSERT INTO public.countries (name, code) VALUES
('Россия', 'RU'), ('Китай', 'CN'), ('Германия', 'DE'), ('Беларусь', 'BY'), ('США', 'US'), ('Польша', 'PL'), ('Чехия', 'CZ'), ('Узбекистан', 'UZ');


-- 4. Изменение таблицы 'products'
ALTER TABLE public.products
ADD COLUMN sku TEXT UNIQUE,
ADD COLUMN brand_id UUID NULL REFERENCES public.brands(id),
ADD COLUMN discount_percentage NUMERIC(5, 2) DEFAULT 0 NOT NULL,
ADD COLUMN origin_country_id INTEGER NULL REFERENCES public.countries(id);