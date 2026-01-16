-- Добавление SEO полей в таблицу brands
-- Эти поля используются для улучшения отображения брендов в поисковых системах

-- SEO описание для meta description (оптимально 120-160 символов)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Ключевые слова для meta keywords (массив строк)
ALTER TABLE brands ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];

-- Комментарии для документации
COMMENT ON COLUMN brands.seo_description IS 'SEO описание для meta description (120-160 символов). Если пустое - используется description.';
COMMENT ON COLUMN brands.seo_keywords IS 'Массив ключевых слов для SEO. Например: ["L.O.L. Surprise", "куклы", "игрушки для девочек"]';
