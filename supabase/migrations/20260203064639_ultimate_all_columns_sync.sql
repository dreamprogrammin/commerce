-- ============================================================================
-- ФИНАЛЬНАЯ УЛЬТИМАТИВНАЯ МИГРАЦИЯ: ВСЕ КОЛОНКИ
-- ============================================================================
-- Добавляет АБСОЛЮТНО ВСЕ недостающие колонки из types/type.ts
-- Больше никаких PGRST204 ошибок!
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '╔════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  УЛЬТИМАТИВНАЯ СИНХРОНИЗАЦИЯ: Добавление ВСЕХ колонок         ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════════╝';

    -- ============================================
    -- CATEGORIES: ВСЕ возможные колонки
    -- ============================================
    RAISE NOTICE '→ CATEGORIES';

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='seo_text') THEN
        ALTER TABLE public.categories ADD COLUMN seo_text TEXT;
        RAISE NOTICE '  ✓ seo_text';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='href') THEN
        ALTER TABLE public.categories ADD COLUMN href TEXT;
        RAISE NOTICE '  ✓ href';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='icon_name') THEN
        ALTER TABLE public.categories ADD COLUMN icon_name TEXT;
        RAISE NOTICE '  ✓ icon_name';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='is_featured') THEN
        ALTER TABLE public.categories ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ is_featured';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='is_root_category') THEN
        ALTER TABLE public.categories ADD COLUMN is_root_category BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ is_root_category';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='display_in_menu') THEN
        ALTER TABLE public.categories ADD COLUMN display_in_menu BOOLEAN DEFAULT TRUE;
        RAISE NOTICE '  ✓ display_in_menu';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='categories' AND column_name='updated_at') THEN
        ALTER TABLE public.categories ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE '  ✓ updated_at';
    END IF;

    -- ============================================
    -- PRODUCTS: ВСЕ возможные колонки
    -- ============================================
    RAISE NOTICE '→ PRODUCTS';

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='seo_text') THEN
        ALTER TABLE public.products ADD COLUMN seo_text TEXT;
        RAISE NOTICE '  ✓ seo_text';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='is_active') THEN
        ALTER TABLE public.products ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE '  ✓ is_active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='sales_count') THEN
        ALTER TABLE public.products ADD COLUMN sales_count INTEGER DEFAULT 0;
        RAISE NOTICE '  ✓ sales_count';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='bonus_points_award') THEN
        ALTER TABLE public.products ADD COLUMN bonus_points_award INTEGER DEFAULT 0;
        RAISE NOTICE '  ✓ bonus_points_award';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='stock_quantity') THEN
        ALTER TABLE public.products ADD COLUMN stock_quantity INTEGER DEFAULT 0;
        RAISE NOTICE '  ✓ stock_quantity';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='min_age_years') THEN
        ALTER TABLE public.products ADD COLUMN min_age_years INTEGER;
        RAISE NOTICE '  ✓ min_age_years';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='max_age_years') THEN
        ALTER TABLE public.products ADD COLUMN max_age_years INTEGER;
        RAISE NOTICE '  ✓ max_age_years';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='gender') THEN
        ALTER TABLE public.products ADD COLUMN gender TEXT;
        RAISE NOTICE '  ✓ gender';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='accessory_ids') THEN
        ALTER TABLE public.products ADD COLUMN accessory_ids UUID[];
        RAISE NOTICE '  ✓ accessory_ids';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='is_accessory') THEN
        ALTER TABLE public.products ADD COLUMN is_accessory BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ is_accessory';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='sku') THEN
        ALTER TABLE public.products ADD COLUMN sku TEXT;
        RAISE NOTICE '  ✓ sku';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='discount_percentage') THEN
        ALTER TABLE public.products ADD COLUMN discount_percentage NUMERIC(5,2) DEFAULT 0;
        RAISE NOTICE '  ✓ discount_percentage';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='origin_country_id') THEN
        ALTER TABLE public.products ADD COLUMN origin_country_id INTEGER;
        RAISE NOTICE '  ✓ origin_country_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='material_id') THEN
        ALTER TABLE public.products ADD COLUMN material_id INTEGER;
        RAISE NOTICE '  ✓ material_id';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='barcode') THEN
        ALTER TABLE public.products ADD COLUMN barcode TEXT;
        RAISE NOTICE '  ✓ barcode';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='product_type') THEN
        ALTER TABLE public.products ADD COLUMN product_type TEXT;
        RAISE NOTICE '  ✓ product_type';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='custom_fields_data') THEN
        ALTER TABLE public.products ADD COLUMN custom_fields_data JSONB;
        RAISE NOTICE '  ✓ custom_fields_data';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='is_on_promotion') THEN
        ALTER TABLE public.products ADD COLUMN is_on_promotion BOOLEAN DEFAULT FALSE;
        RAISE NOTICE '  ✓ is_on_promotion';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='products' AND column_name='updated_at') THEN
        ALTER TABLE public.products ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE '  ✓ updated_at';
    END IF;

    -- ============================================
    -- BRANDS: ВСЕ возможные колонки
    -- ============================================
    RAISE NOTICE '→ BRANDS';

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='seo_text') THEN
        ALTER TABLE public.brands ADD COLUMN seo_text TEXT;
        RAISE NOTICE '  ✓ seo_text';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='brands' AND column_name='updated_at') THEN
        ALTER TABLE public.brands ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE '  ✓ updated_at';
    END IF;

    -- ============================================
    -- SLIDES: ВСЕ возможные колонки
    -- ============================================
    RAISE NOTICE '→ SLIDES';

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='title') THEN
        ALTER TABLE public.slides ADD COLUMN title TEXT;
        RAISE NOTICE '  ✓ title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='subtitle') THEN
        ALTER TABLE public.slides ADD COLUMN subtitle TEXT;
        RAISE NOTICE '  ✓ subtitle';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='link_url') THEN
        ALTER TABLE public.slides ADD COLUMN link_url TEXT;
        RAISE NOTICE '  ✓ link_url';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='is_active') THEN
        ALTER TABLE public.slides ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE '  ✓ is_active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='slides' AND column_name='updated_at') THEN
        ALTER TABLE public.slides ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE '  ✓ updated_at';
    END IF;

    -- ============================================
    -- BANNERS: ВСЕ возможные колонки
    -- ============================================
    RAISE NOTICE '→ BANNERS';

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='title') THEN
        ALTER TABLE public.banners ADD COLUMN title TEXT;
        RAISE NOTICE '  ✓ title';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='is_active') THEN
        ALTER TABLE public.banners ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
        RAISE NOTICE '  ✓ is_active';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='banners' AND column_name='updated_at') THEN
        ALTER TABLE public.banners ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
        RAISE NOTICE '  ✓ updated_at';
    END IF;

    RAISE NOTICE '╔════════════════════════════════════════════════════════════════╗';
    RAISE NOTICE '║  ✅ УЛЬТИМАТИВНАЯ СИНХРОНИЗАЦИЯ ЗАВЕРШЕНА                     ║';
    RAISE NOTICE '╚════════════════════════════════════════════════════════════════╝';

END $$;

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
