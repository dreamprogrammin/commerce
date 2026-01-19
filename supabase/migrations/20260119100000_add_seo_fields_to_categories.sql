-- Добавляем SEO поля в таблицу categories
-- Для улучшения SEO как у detmir.kz

-- SEO заголовок для meta title (может отличаться от name)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_title TEXT;

-- H1 заголовок на странице (может отличаться от name)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_h1 TEXT;

-- SEO текст внизу страницы (длинный контент для Google)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_text TEXT;

-- Ключевые слова для meta keywords
ALTER TABLE categories ADD COLUMN IF NOT EXISTS seo_keywords TEXT[];

-- Комментарии к полям
COMMENT ON COLUMN categories.seo_title IS 'SEO заголовок для meta title. Если пустой, используется name';
COMMENT ON COLUMN categories.seo_h1 IS 'H1 заголовок на странице. Если пустой, используется name';
COMMENT ON COLUMN categories.seo_text IS 'SEO текст внизу страницы категории для улучшения индексации';
COMMENT ON COLUMN categories.seo_keywords IS 'Массив ключевых слов для meta keywords';
COMMENT ON COLUMN categories.description IS 'SEO описание для meta description';
