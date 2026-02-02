-- Безопасное добавление SEO колонок к таблице brands
-- Проверяем существование колонки перед добавлением

DO $$
BEGIN
    -- Проверяем и добавляем seo_description
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'brands'
          AND column_name = 'seo_description'
    ) THEN
        ALTER TABLE public.brands ADD COLUMN seo_description TEXT;
        COMMENT ON COLUMN public.brands.seo_description IS 'SEO описание для meta description (120-160 символов). Если пустое - используется description.';
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
        COMMENT ON COLUMN public.brands.seo_keywords IS 'Массив ключевых слов для SEO. Например: ["L.O.L. Surprise", "куклы", "игрушки для девочек"]';
    END IF;
END $$;

-- Принудительно обновляем кэш схемы PostgREST
NOTIFY pgrst, 'reload schema';
