-- Добавление недостающей колонки allowed_product_line_ids
-- Исправление проблемы с незавершенной миграцией 20260129120000

DO $$
BEGIN
    -- ============================================
    -- ТАБЛИЦА: categories
    -- ============================================

    -- Добавляем allowed_product_line_ids если не существует
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'categories'
          AND column_name = 'allowed_product_line_ids'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN allowed_product_line_ids UUID[];
        COMMENT ON COLUMN public.categories.allowed_product_line_ids IS 'Массив ID линеек продуктов, которые разрешены в этой категории. NULL = все линейки';
        RAISE NOTICE 'Added column: categories.allowed_product_line_ids';

        -- Создаём GIN индекс для массива
        CREATE INDEX IF NOT EXISTS idx_categories_allowed_product_lines
        ON public.categories USING GIN (allowed_product_line_ids);
        RAISE NOTICE 'Created index: idx_categories_allowed_product_lines';
    ELSE
        RAISE NOTICE 'Column already exists: categories.allowed_product_line_ids';

        -- Проверяем индекс
        IF NOT EXISTS (
            SELECT 1
            FROM pg_indexes
            WHERE schemaname = 'public'
              AND tablename = 'categories'
              AND indexname = 'idx_categories_allowed_product_lines'
        ) THEN
            CREATE INDEX idx_categories_allowed_product_lines
            ON public.categories USING GIN (allowed_product_line_ids);
            RAISE NOTICE 'Created index: idx_categories_allowed_product_lines';
        END IF;
    END IF;

END $$;

-- Принудительно обновляем схему PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
