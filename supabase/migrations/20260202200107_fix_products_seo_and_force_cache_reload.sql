-- Финальная миграция для добавления SEO полей в products
-- С агрессивным обновлением кэша PostgREST

DO $$
BEGIN
    -- ============================================
    -- ТАБЛИЦА: products - SEO поля
    -- ============================================

    -- Проверяем и добавляем seo_description
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'seo_description'
    ) THEN
        ALTER TABLE public.products ADD COLUMN seo_description TEXT;
        COMMENT ON COLUMN public.products.seo_description IS 'SEO описание для meta description (120-160 символов). Если пустое - используется description.';
        RAISE NOTICE 'Added seo_description to products';
    END IF;

    -- Проверяем и добавляем seo_keywords
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'seo_keywords'
    ) THEN
        ALTER TABLE public.products ADD COLUMN seo_keywords TEXT[];
        COMMENT ON COLUMN public.products.seo_keywords IS 'Массив ключевых слов для SEO. Например: ["игрушки для девочек", "куклы", "L.O.L."]';
        RAISE NOTICE 'Added seo_keywords to products';
    END IF;

END $$;

-- Множественные NOTIFY для принудительного обновления кэша
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
NOTIFY pgrst;

-- Небольшая задержка и повторный NOTIFY
DO $$
BEGIN
    PERFORM pg_sleep(1);
    PERFORM pg_notify('pgrst', 'reload schema');
END $$;
