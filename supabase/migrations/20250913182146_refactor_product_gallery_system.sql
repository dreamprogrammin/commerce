-- Финальная миграция для системы галерей продуктов.
-- Этот скрипт выполняет полную миграцию от старой системы (одна колонка image_url)
-- к новой (отдельная таблица product_images).

-- 1. Создаем новую таблицу `product_images`, если ее еще нет.
CREATE TABLE IF NOT EXISTS public.product_images (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0,
    alt_text TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индексы для производительности
CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON public.product_images (product_id);

-- Настройка RLS (безопасность)
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Product images are viewable by everyone" ON public.product_images;
CREATE POLICY "Product images are viewable by everyone" ON public.product_images FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins can manage product images" ON public.product_images;
CREATE POLICY "Admins can manage product images" ON public.product_images FOR ALL USING (auth.role() = 'authenticated');


-- 2. Переносим данные из старой колонки `products.image_url` в новую таблицу.
-- Этот блок безопасно выполнится, даже если колонка `image_url` уже удалена.
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='products' AND column_name='image_url') THEN
    INSERT INTO public.product_images (product_id, image_url, display_order)
    SELECT id, image_url, 0
    FROM public.products
    WHERE image_url IS NOT NULL
    ON CONFLICT (product_id, image_url) DO NOTHING; -- Не создаем дубликаты
  END IF;
END $$;


-- 3. Удаляем устаревшую колонку `image_url` из таблицы `products`.
ALTER TABLE public.products
DROP COLUMN IF EXISTS image_url;