-- ============================================================================
-- ПАТЧ: Добавление meta_description и других SEO колонок
-- ============================================================================
-- Добавляет все возможные SEO/meta колонки для categories, products, brands
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '→ Добавление SEO/meta колонок';

    -- ============================================
    -- CATEGORIES: meta колонки
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='meta_description') THEN
        ALTER TABLE public.categories ADD COLUMN meta_description TEXT;
        RAISE NOTICE '  ✓ categories.meta_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='meta_title') THEN
        ALTER TABLE public.categories ADD COLUMN meta_title TEXT;
        RAISE NOTICE '  ✓ categories.meta_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='meta_keywords') THEN
        ALTER TABLE public.categories ADD COLUMN meta_keywords TEXT[];
        RAISE NOTICE '  ✓ categories.meta_keywords';
    END IF;

    -- ============================================
    -- PRODUCTS: meta колонки
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='meta_description') THEN
        ALTER TABLE public.products ADD COLUMN meta_description TEXT;
        RAISE NOTICE '  ✓ products.meta_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='meta_title') THEN
        ALTER TABLE public.products ADD COLUMN meta_title TEXT;
        RAISE NOTICE '  ✓ products.meta_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='meta_keywords') THEN
        ALTER TABLE public.products ADD COLUMN meta_keywords TEXT[];
        RAISE NOTICE '  ✓ products.meta_keywords';
    END IF;

    -- ============================================
    -- BRANDS: meta колонки
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='meta_description') THEN
        ALTER TABLE public.brands ADD COLUMN meta_description TEXT;
        RAISE NOTICE '  ✓ brands.meta_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='meta_title') THEN
        ALTER TABLE public.brands ADD COLUMN meta_title TEXT;
        RAISE NOTICE '  ✓ brands.meta_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='meta_keywords') THEN
        ALTER TABLE public.brands ADD COLUMN meta_keywords TEXT[];
        RAISE NOTICE '  ✓ brands.meta_keywords';
    END IF;

    -- ============================================
    -- SLIDES: meta колонки (на всякий случай)
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='meta_description') THEN
        ALTER TABLE public.slides ADD COLUMN meta_description TEXT;
        RAISE NOTICE '  ✓ slides.meta_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='alt_text') THEN
        ALTER TABLE public.slides ADD COLUMN alt_text TEXT;
        RAISE NOTICE '  ✓ slides.alt_text';
    END IF;

    -- ============================================
    -- PRODUCT_IMAGES: alt_text для доступности
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_images' AND column_name='alt_text') THEN
        ALTER TABLE public.product_images ADD COLUMN alt_text TEXT;
        RAISE NOTICE '  ✓ product_images.alt_text';
    END IF;

    RAISE NOTICE '✅ Все SEO/meta колонки проверены и добавлены';

END $$;

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
