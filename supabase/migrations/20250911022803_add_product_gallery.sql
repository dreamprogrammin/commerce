-- Миграция для создания галереи изображений товаров.

-- 1. Создаем новую таблицу `product_images`
CREATE TABLE public.product_images (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    image_url TEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 0, -- Для сортировки изображений в галерее
    alt_text TEXT, -- Опциональный alt-текст для SEO
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для быстрого поиска всех изображений для одного товара
CREATE INDEX idx_product_images_product_id ON public.product_images (product_id);

-- Включаем RLS для безопасности
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Политика: Все могут видеть изображения (публичный доступ)
CREATE POLICY "Product images are viewable by everyone"
ON public.product_images FOR SELECT
USING (true);

-- Политика: Только админы (или аутентифицированные пользователи) могут управлять изображениями.
-- Здесь можно уточнить роль, если у вас есть роль 'admin'.
CREATE POLICY "Admins can manage product images"
ON public.product_images FOR ALL
USING (auth.role() = 'authenticated') -- или `(SELECT is_admin FROM public.profiles WHERE id = auth.uid())`
WITH CHECK (auth.role() = 'authenticated');


-- 2. (Опционально, но рекомендуется) Переносим старые изображения.
-- Этот блок кода найдет все товары, у которых заполнено старое поле `image_url`,
-- и создаст для них запись в новой таблице `product_images`, сделав это изображение главным.
INSERT INTO public.product_images (product_id, image_url, display_order)
SELECT id, image_url, 0
FROM public.products
WHERE image_url IS NOT NULL;


-- 3. (Опционально) Удаляем старую колонку из `products`.
-- После того как вы убедитесь, что все изображения перенесены, можно удалить старую колонку.
-- ВНИМАНИЕ: Это может сломать ваш текущий код. Делайте это, когда будете готовы
-- полностью перейти на новую систему.
-- ALTER TABLE public.products DROP COLUMN image_url;