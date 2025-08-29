-- Добавляем колонку 'is_featured' в таблицу категорий.
-- Эта колонка будет использоваться для отметки "популярных" категорий,
-- которые будут отображаться на главной странице.
ALTER TABLE public.categories
ADD COLUMN is_featured BOOLEAN NOT NULL DEFAULT FALSE;

-- Для ускорения запросов на главной странице, добавляем индекс на эту новую колонку.
CREATE INDEX idx_categories_is_featured ON public.categories (is_featured)
WHERE is_featured = TRUE;