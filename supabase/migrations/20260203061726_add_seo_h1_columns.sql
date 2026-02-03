-- ============================================================================
-- ПАТЧ: Добавление seo_h1 и всех остальных SEO колонок
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '→ Добавление всех SEO колонок (seo_h1, og_*, canonical, etc.)';

    -- ============================================
    -- CATEGORIES: все SEO колонки
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='seo_h1') THEN
        ALTER TABLE public.categories ADD COLUMN seo_h1 TEXT;
        RAISE NOTICE '  ✓ categories.seo_h1';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='canonical_url') THEN
        ALTER TABLE public.categories ADD COLUMN canonical_url TEXT;
        RAISE NOTICE '  ✓ categories.canonical_url';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='og_title') THEN
        ALTER TABLE public.categories ADD COLUMN og_title TEXT;
        RAISE NOTICE '  ✓ categories.og_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='og_description') THEN
        ALTER TABLE public.categories ADD COLUMN og_description TEXT;
        RAISE NOTICE '  ✓ categories.og_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='og_image') THEN
        ALTER TABLE public.categories ADD COLUMN og_image TEXT;
        RAISE NOTICE '  ✓ categories.og_image';
    END IF;

    -- ============================================
    -- PRODUCTS: все SEO колонки
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='seo_h1') THEN
        ALTER TABLE public.products ADD COLUMN seo_h1 TEXT;
        RAISE NOTICE '  ✓ products.seo_h1';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='canonical_url') THEN
        ALTER TABLE public.products ADD COLUMN canonical_url TEXT;
        RAISE NOTICE '  ✓ products.canonical_url';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='og_title') THEN
        ALTER TABLE public.products ADD COLUMN og_title TEXT;
        RAISE NOTICE '  ✓ products.og_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='og_description') THEN
        ALTER TABLE public.products ADD COLUMN og_description TEXT;
        RAISE NOTICE '  ✓ products.og_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='og_image') THEN
        ALTER TABLE public.products ADD COLUMN og_image TEXT;
        RAISE NOTICE '  ✓ products.og_image';
    END IF;

    -- ============================================
    -- BRANDS: все SEO колонки
    -- ============================================

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='seo_h1') THEN
        ALTER TABLE public.brands ADD COLUMN seo_h1 TEXT;
        RAISE NOTICE '  ✓ brands.seo_h1';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='canonical_url') THEN
        ALTER TABLE public.brands ADD COLUMN canonical_url TEXT;
        RAISE NOTICE '  ✓ brands.canonical_url';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='og_title') THEN
        ALTER TABLE public.brands ADD COLUMN og_title TEXT;
        RAISE NOTICE '  ✓ brands.og_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='og_description') THEN
        ALTER TABLE public.brands ADD COLUMN og_description TEXT;
        RAISE NOTICE '  ✓ brands.og_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='og_image') THEN
        ALTER TABLE public.brands ADD COLUMN og_image TEXT;
        RAISE NOTICE '  ✓ brands.og_image';
    END IF;

    RAISE NOTICE '✅ Все расширенные SEO колонки добавлены';

END $$;

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
