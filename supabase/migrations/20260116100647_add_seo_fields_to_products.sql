-- Добавление SEO полей в таблицу products
-- Эти поля используются для улучшения отображения товаров в поисковых системах

-- SEO описание для meta description (оптимально 120-160 символов)
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description TEXT;

-- Ключевые слова для meta keywords (массив строк)
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];

-- Комментарии для документации
COMMENT ON COLUMN products.seo_description IS 'SEO описание для meta description (120-160 символов). Если пустое - используется description.';
COMMENT ON COLUMN products.seo_keywords IS 'Массив ключевых слов для SEO. Например: ["игрушки для девочек", "куклы", "L.O.L."]';
