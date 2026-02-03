-- ============================================================================
-- ПАТЧ: Добавление всех SEO полей для banners
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '→ Добавление SEO полей для banners';

    -- SEO поля
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='seo_title') THEN
        ALTER TABLE public.banners ADD COLUMN seo_title TEXT;
        RAISE NOTICE '  ✓ banners.seo_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='seo_description') THEN
        ALTER TABLE public.banners ADD COLUMN seo_description TEXT;
        RAISE NOTICE '  ✓ banners.seo_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='seo_keywords') THEN
        ALTER TABLE public.banners ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE '  ✓ banners.seo_keywords';
    END IF;

    -- Meta теги
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='meta_title') THEN
        ALTER TABLE public.banners ADD COLUMN meta_title TEXT;
        RAISE NOTICE '  ✓ banners.meta_title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='meta_description') THEN
        ALTER TABLE public.banners ADD COLUMN meta_description TEXT;
        RAISE NOTICE '  ✓ banners.meta_description';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='meta_keywords') THEN
        ALTER TABLE public.banners ADD COLUMN meta_keywords TEXT[];
        RAISE NOTICE '  ✓ banners.meta_keywords';
    END IF;

    -- Alt text для доступности
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='alt_text') THEN
        ALTER TABLE public.banners ADD COLUMN alt_text TEXT;
        RAISE NOTICE '  ✓ banners.alt_text';
    END IF;

    RAISE NOTICE '✅ Все SEO поля добавлены для banners';

END $$;

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
