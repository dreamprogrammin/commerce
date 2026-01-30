-- Добавление SEO полей для категорий
-- Эти поля предназначены для SEO оптимизации категорий первого уровня

ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS meta_title TEXT,
ADD COLUMN IF NOT EXISTS meta_description TEXT,
ADD COLUMN IF NOT EXISTS meta_keywords TEXT;

COMMENT ON COLUMN public.categories.meta_title IS 'SEO заголовок для поисковых систем (title tag)';
COMMENT ON COLUMN public.categories.meta_description IS 'SEO описание для поисковых систем (meta description)';
COMMENT ON COLUMN public.categories.meta_keywords IS 'SEO ключевые слова (meta keywords)';
