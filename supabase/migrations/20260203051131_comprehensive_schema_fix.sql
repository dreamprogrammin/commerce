-- Комплексная проверка и исправление всех недостающих колонок
-- Исправляет проблемы с незавершенными миграциями

DO $$
BEGIN
    RAISE NOTICE 'Starting comprehensive schema check...';

    -- ============================================
    -- ТАБЛИЦА: products
    -- ============================================

    -- is_new (для новинок)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_new'
    ) THEN
        ALTER TABLE public.products ADD COLUMN is_new BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added: products.is_new';
    END IF;

    -- is_on_sale (для акций)
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_on_sale'
    ) THEN
        ALTER TABLE public.products ADD COLUMN is_on_sale BOOLEAN DEFAULT FALSE;
        RAISE NOTICE 'Added: products.is_on_sale';
    END IF;

    -- seo_title
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'seo_title'
    ) THEN
        ALTER TABLE public.products ADD COLUMN seo_title TEXT;
        RAISE NOTICE 'Added: products.seo_title';
    END IF;

    -- seo_description
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'seo_description'
    ) THEN
        ALTER TABLE public.products ADD COLUMN seo_description TEXT;
        RAISE NOTICE 'Added: products.seo_description';
    END IF;

    -- seo_keywords
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'seo_keywords'
    ) THEN
        ALTER TABLE public.products ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE 'Added: products.seo_keywords';
    END IF;

    -- ============================================
    -- ТАБЛИЦА: categories
    -- ============================================

    -- seo_title
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'seo_title'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN seo_title TEXT;
        RAISE NOTICE 'Added: categories.seo_title';
    END IF;

    -- seo_description
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'seo_description'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN seo_description TEXT;
        RAISE NOTICE 'Added: categories.seo_description';
    END IF;

    -- seo_keywords
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'seo_keywords'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN seo_keywords TEXT[];
        RAISE NOTICE 'Added: categories.seo_keywords';
    END IF;

    -- ============================================
    -- ТАБЛИЦА: brands
    -- ============================================

    -- seo_title
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'brands' AND column_name = 'seo_title'
    ) THEN
        ALTER TABLE public.brands ADD COLUMN seo_title TEXT;
        RAISE NOTICE 'Added: brands.seo_title';
    END IF;

    -- Создание индексов для новых полей (если нужно)
    CREATE INDEX IF NOT EXISTS idx_products_is_new ON public.products(is_new) WHERE is_new = true;
    CREATE INDEX IF NOT EXISTS idx_products_is_on_sale ON public.products(is_on_sale) WHERE is_on_sale = true;

    RAISE NOTICE 'Comprehensive schema check completed!';

END $$;

-- Принудительно обновляем схему PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- Дополнение: blur_placeholder для categories
DO $$
BEGIN
    -- blur_placeholder для categories
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'blur_placeholder'
    ) THEN
