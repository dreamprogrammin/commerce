-- ФИНАЛЬНАЯ ПОЛНАЯ ПРОВЕРКА ВСЕХ КОЛОНОК
-- Проверяет и добавляет все колонки из миграций с ноября 2025 по февраль 2026

DO $$
BEGIN
    RAISE NOTICE '=== Starting FINAL complete schema check ===';

    -- ============================================
    -- SLIDES: все blur и mobile колонки
    -- ============================================
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'slides' AND column_name = 'blur_placeholder') THEN
        ALTER TABLE public.slides ADD COLUMN blur_placeholder TEXT;
        RAISE NOTICE '[slides] Added: blur_placeholder';
    END IF;

    -- ============================================
    -- BANNERS: blur placeholder
    -- ============================================
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'banners') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'banners' AND column_name = 'blur_placeholder') THEN
            ALTER TABLE public.banners ADD COLUMN blur_placeholder TEXT;
            RAISE NOTICE '[banners] Added: blur_placeholder';
        END IF;
    END IF;

    -- ============================================
    -- PRODUCTS: все флаги и SEO
    -- ============================================
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_featured') THEN
        ALTER TABLE public.products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '[products] Added: is_featured';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'featured_order') THEN
        ALTER TABLE public.products ADD COLUMN featured_order INTEGER DEFAULT 0;
        RAISE NOTICE '[products] Added: featured_order';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_new') THEN
        ALTER TABLE public.products ADD COLUMN is_new BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '[products] Added: is_new';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'seo_description') THEN
        ALTER TABLE public.products ADD COLUMN seo_description TEXT;
        RAISE NOTICE '[products] Added: seo_description';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'seo_keywords') THEN
        ALTER TABLE public.products ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE '[products] Added: seo_keywords';
    END IF;

    -- ============================================
    -- BRANDS: все SEO колонки
    -- ============================================
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'seo_description') THEN
        ALTER TABLE public.brands ADD COLUMN seo_description TEXT;
        RAISE NOTICE '[brands] Added: seo_description';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'seo_keywords') THEN
        ALTER TABLE public.brands ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE '[brands] Added: seo_keywords';
    END IF;

    RAISE NOTICE '=== FINAL complete schema check completed ===';

END $$;

-- Принудительное обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
