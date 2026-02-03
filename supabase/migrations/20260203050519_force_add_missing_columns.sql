-- Принудительное добавление недостающих колонок
-- Эта миграция исправляет проблему с кэшем PostgREST

DO $$
BEGIN
    -- ============================================
    -- ТАБЛИЦА: slides
    -- ============================================

    -- Добавляем image_url_mobile если не существует
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'slides'
          AND column_name = 'image_url_mobile'
    ) THEN
        ALTER TABLE public.slides ADD COLUMN image_url_mobile TEXT;
        COMMENT ON COLUMN public.slides.image_url_mobile IS 'URL мобильной версии изображения слайда';
        RAISE NOTICE 'Added column: slides.image_url_mobile';
    ELSE
        RAISE NOTICE 'Column already exists: slides.image_url_mobile';
    END IF;

    -- Добавляем blur_placeholder_mobile если не существует
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'slides'
          AND column_name = 'blur_placeholder_mobile'
    ) THEN
        ALTER TABLE public.slides ADD COLUMN blur_placeholder_mobile TEXT;
        COMMENT ON COLUMN public.slides.blur_placeholder_mobile IS 'Blur placeholder для мобильного изображения';
        RAISE NOTICE 'Added column: slides.blur_placeholder_mobile';
    ELSE
        RAISE NOTICE 'Column already exists: slides.blur_placeholder_mobile';
    END IF;

    -- ============================================
    -- ТАБЛИЦА: categories
    -- ============================================

    -- Добавляем allowed_brand_ids если не существует
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'categories'
          AND column_name = 'allowed_brand_ids'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN allowed_brand_ids UUID[];
        COMMENT ON COLUMN public.categories.allowed_brand_ids IS 'Массив ID брендов, которые разрешены в этой категории. NULL = все бренды';
        RAISE NOTICE 'Added column: categories.allowed_brand_ids';

        -- Создаём GIN индекс для массива
        CREATE INDEX IF NOT EXISTS idx_categories_allowed_brands
        ON public.categories USING GIN (allowed_brand_ids);
    ELSE
        RAISE NOTICE 'Column already exists: categories.allowed_brand_ids';

        -- Проверяем индекс
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'categories'
              AND indexname = 'idx_categories_allowed_brands'
        ) THEN
            CREATE INDEX idx_categories_allowed_brands
            ON public.categories USING GIN (allowed_brand_ids);
            RAISE NOTICE 'Created index: idx_categories_allowed_brands';
        END IF;
    END IF;

END $$;

-- Принудительно обновляем схему PostgREST
NOTIFY pgrst, 'reload schema';

-- Принудительно обновляем кэш конфигурации PostgREST
NOTIFY pgrst, 'reload config';
