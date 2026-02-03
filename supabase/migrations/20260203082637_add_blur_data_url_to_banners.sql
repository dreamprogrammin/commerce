-- ============================================================================
-- ПАТЧ: Добавление blur_data_url для всех таблиц с изображениями
-- ============================================================================
-- В коде используется blur_data_url, но в БД была blur_placeholder
-- Добавляем обе колонки для совместимости
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '→ Добавление blur_data_url для таблиц с изображениями';

    -- ============================================
    -- BANNERS
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='blur_data_url') THEN
        ALTER TABLE public.banners ADD COLUMN blur_data_url TEXT;
        RAISE NOTICE '  ✓ banners.blur_data_url';
    END IF;

    -- ============================================
    -- SLIDES
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='blur_data_url') THEN
        ALTER TABLE public.slides ADD COLUMN blur_data_url TEXT;
        RAISE NOTICE '  ✓ slides.blur_data_url';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='blur_data_url_mobile') THEN
        ALTER TABLE public.slides ADD COLUMN blur_data_url_mobile TEXT;
        RAISE NOTICE '  ✓ slides.blur_data_url_mobile';
    END IF;

    -- ============================================
    -- CATEGORIES
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='blur_data_url') THEN
        ALTER TABLE public.categories ADD COLUMN blur_data_url TEXT;
        RAISE NOTICE '  ✓ categories.blur_data_url';
    END IF;

    -- ============================================
    -- BRANDS
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='blur_data_url') THEN
        ALTER TABLE public.brands ADD COLUMN blur_data_url TEXT;
        RAISE NOTICE '  ✓ brands.blur_data_url';
    END IF;

    -- ============================================
    -- PRODUCT_IMAGES
    -- ============================================
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='product_images' AND column_name='blur_data_url') THEN
        ALTER TABLE public.product_images ADD COLUMN blur_data_url TEXT;
        RAISE NOTICE '  ✓ product_images.blur_data_url';
    END IF;

    RAISE NOTICE '✅ blur_data_url добавлен для всех таблиц с изображениями';

END $$;

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
