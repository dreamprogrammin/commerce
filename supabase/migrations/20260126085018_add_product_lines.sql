-- =============================================
-- Миграция: Добавление линеек продуктов (Product Lines)
-- Линейка - это подбренд/франшиза, например:
-- Mattel → Barbie, Hot Wheels, Fisher-Price
-- Hasbro → Transformers, My Little Pony, Nerf
-- =============================================

-- 1. Создаем таблицу линеек
CREATE TABLE IF NOT EXISTS public.product_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    logo_url TEXT,
    seo_description TEXT,
    seo_keywords TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,

    -- Уникальная комбинация: один бренд не может иметь две линейки с одинаковым названием
    CONSTRAINT product_lines_brand_name_unique UNIQUE (brand_id, name)
);

-- 2. Создаем индексы
CREATE INDEX IF NOT EXISTS idx_product_lines_brand_id ON public.product_lines(brand_id);
CREATE INDEX IF NOT EXISTS idx_product_lines_slug ON public.product_lines(slug);
CREATE INDEX IF NOT EXISTS idx_product_lines_name ON public.product_lines(name);

-- 3. Добавляем колонку product_line_id в таблицу products
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS product_line_id UUID REFERENCES public.product_lines(id) ON DELETE SET NULL;

-- 4. Индекс для быстрого поиска товаров по линейке
CREATE INDEX IF NOT EXISTS idx_products_product_line_id ON public.products(product_line_id);

-- 5. RLS политики для product_lines
ALTER TABLE public.product_lines ENABLE ROW LEVEL SECURITY;

-- Публичное чтение
CREATE POLICY "product_lines_public_read" ON public.product_lines
    FOR SELECT
    USING (true);

-- Только админы могут создавать
CREATE POLICY "product_lines_admin_insert" ON public.product_lines
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Только админы могут обновлять
CREATE POLICY "product_lines_admin_update" ON public.product_lines
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Только админы могут удалять
CREATE POLICY "product_lines_admin_delete" ON public.product_lines
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- 6. Триггер для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION public.update_product_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_product_lines_updated_at ON public.product_lines;
CREATE TRIGGER trigger_update_product_lines_updated_at
    BEFORE UPDATE ON public.product_lines
    FOR EACH ROW
    EXECUTE FUNCTION public.update_product_lines_updated_at();

-- 7. Функция для получения линеек бренда
CREATE OR REPLACE FUNCTION public.get_product_lines_by_brand(p_brand_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    description TEXT,
    logo_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.slug,
        pl.description,
        pl.logo_url
    FROM public.product_lines pl
    WHERE pl.brand_id = p_brand_id
    ORDER BY pl.name ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 8. Функция для получения линеек по категории (линейки, у которых есть товары в категории)
CREATE OR REPLACE FUNCTION public.get_product_lines_by_category_slug(p_category_slug TEXT)
RETURNS TABLE (
    id UUID,
    name TEXT,
    slug TEXT,
    brand_id UUID,
    brand_name TEXT,
    product_count BIGINT
) AS $$
DECLARE
    v_category_id UUID;
    v_category_ids UUID[];
BEGIN
    -- Получаем ID категории по slug
    SELECT c.id INTO v_category_id
    FROM public.categories c
    WHERE c.slug = p_category_slug;

    IF v_category_id IS NULL THEN
        RETURN;
    END IF;

    -- Получаем все дочерние категории (включая текущую)
    WITH RECURSIVE category_tree AS (
        SELECT id FROM public.categories WHERE id = v_category_id
        UNION ALL
        SELECT c.id FROM public.categories c
        INNER JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT ARRAY_AGG(id) INTO v_category_ids FROM category_tree;

    RETURN QUERY
    SELECT
        pl.id,
        pl.name,
        pl.slug,
        pl.brand_id,
        b.name AS brand_name,
        COUNT(p.id) AS product_count
    FROM public.product_lines pl
    INNER JOIN public.brands b ON b.id = pl.brand_id
    INNER JOIN public.products p ON p.product_line_id = pl.id
    WHERE p.category_id = ANY(v_category_ids)
      AND p.is_active = true
    GROUP BY pl.id, pl.name, pl.slug, pl.brand_id, b.name
    ORDER BY b.name ASC, pl.name ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 9. Комментарии к таблице
COMMENT ON TABLE public.product_lines IS 'Линейки продуктов (подбренды/франшизы). Например: Mattel → Barbie, Hot Wheels';
COMMENT ON COLUMN public.product_lines.brand_id IS 'ID родительского бренда';
COMMENT ON COLUMN public.product_lines.name IS 'Название линейки (например: Barbie, Hot Wheels)';
COMMENT ON COLUMN public.product_lines.slug IS 'URL-slug для SEO';
COMMENT ON COLUMN public.product_lines.logo_url IS 'URL логотипа линейки в Supabase Storage';

-- 10. Создание Storage bucket для логотипов линеек
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-line-logos',
    'product-line-logos',
    true,
    5242880, -- 5MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies для bucket product-line-logos
CREATE POLICY "product_line_logos_public_read" ON storage.objects
    FOR SELECT
    USING (bucket_id = 'product-line-logos');

CREATE POLICY "product_line_logos_admin_insert" ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'product-line-logos'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "product_line_logos_admin_update" ON storage.objects
    FOR UPDATE
    USING (
        bucket_id = 'product-line-logos'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

CREATE POLICY "product_line_logos_admin_delete" ON storage.objects
    FOR DELETE
    USING (
        bucket_id = 'product-line-logos'
        AND EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );
