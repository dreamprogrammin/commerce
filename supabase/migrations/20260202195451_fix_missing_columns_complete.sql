-- Комплексная миграция для исправления всех недостающих колонок
-- Проверяет существование каждой колонки перед добавлением

DO $$
BEGIN
    -- ============================================
    -- ТАБЛИЦА: products
    -- ============================================

    -- Проверяем и добавляем is_featured
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'is_featured'
    ) THEN
        ALTER TABLE public.products ADD COLUMN is_featured BOOLEAN DEFAULT FALSE;
        COMMENT ON COLUMN public.products.is_featured IS 'Флаг товара дня для отображения в карусели';
    END IF;

    -- Проверяем и добавляем featured_order
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'featured_order'
    ) THEN
        ALTER TABLE public.products ADD COLUMN featured_order INTEGER DEFAULT 0;
        COMMENT ON COLUMN public.products.featured_order IS 'Порядок отображения в карусели (меньше = раньше)';
    END IF;

    -- Создаём индекс для is_featured + featured_order (если не существует)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'products'
          AND indexname = 'idx_products_featured'
    ) THEN
        CREATE INDEX idx_products_featured
        ON public.products(is_featured, featured_order)
        WHERE is_featured = true;
    END IF;

    -- ============================================
    -- ТАБЛИЦА: categories
    -- ============================================

    -- Проверяем и добавляем featured_order
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'categories'
          AND column_name = 'featured_order'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN featured_order INTEGER DEFAULT 0;
        COMMENT ON COLUMN public.categories.featured_order IS 'Определяет размер карточки в масонри-сетке каталога: 0-33: small, 34-66: medium, 67-100: large';
    END IF;

    -- Создаём индекс для featured_order (если не существует)
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND tablename = 'categories'
          AND indexname = 'idx_categories_featured_order'
    ) THEN
        CREATE INDEX idx_categories_featured_order
        ON public.categories(featured_order DESC);
    END IF;

    -- ============================================
    -- ТАБЛИЦА: brands
    -- ============================================

    -- Проверяем и добавляем seo_description
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'brands'
          AND column_name = 'seo_description'
    ) THEN
        ALTER TABLE public.brands ADD COLUMN seo_description TEXT;
        COMMENT ON COLUMN public.brands.seo_description IS 'SEO описание для meta description (120-160 символов)';
    END IF;

    -- Проверяем и добавляем seo_keywords
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'brands'
          AND column_name = 'seo_keywords'
    ) THEN
        ALTER TABLE public.brands ADD COLUMN seo_keywords TEXT[];
        COMMENT ON COLUMN public.brands.seo_keywords IS 'Массив ключевых слов для SEO';
    END IF;

    -- ============================================
    -- ТАБЛИЦА: banners
    -- ============================================

    -- Проверяем и добавляем blur_placeholder (если нужно)
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'banners'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'banners'
              AND column_name = 'blur_placeholder'
        ) THEN
            ALTER TABLE public.banners ADD COLUMN blur_placeholder TEXT;
            COMMENT ON COLUMN public.banners.blur_placeholder IS 'Base64 LQIP для blur-up эффекта';
        END IF;
    END IF;

    -- ============================================
    -- ТАБЛИЦА: slides
    -- ============================================

    -- Проверяем и добавляем blur_placeholder (если нужно)
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'slides'
    ) THEN
        IF NOT EXISTS (
            SELECT 1
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'slides'
              AND column_name = 'blur_placeholder'
        ) THEN
            ALTER TABLE public.slides ADD COLUMN blur_placeholder TEXT;
            COMMENT ON COLUMN public.slides.blur_placeholder IS 'Base64 LQIP для blur-up эффекта';
        END IF;
    END IF;

END $$;

-- Принудительно обновляем кэш схемы PostgREST
NOTIFY pgrst, 'reload schema';
