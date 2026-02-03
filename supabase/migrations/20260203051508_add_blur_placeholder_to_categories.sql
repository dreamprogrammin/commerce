-- Добавление blur_placeholder для categories

DO $$
BEGIN
    -- blur_placeholder для categories
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'blur_placeholder'
    ) THEN
        ALTER TABLE public.categories ADD COLUMN blur_placeholder TEXT;
        COMMENT ON COLUMN public.categories.blur_placeholder IS 'Base64 LQIP для blur-up эффекта изображения категории';
        RAISE NOTICE 'Added: categories.blur_placeholder';
    ELSE
        RAISE NOTICE 'Column already exists: categories.blur_placeholder';
    END IF;
END $$;

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
