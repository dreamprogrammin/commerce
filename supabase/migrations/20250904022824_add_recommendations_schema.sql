-- Миграция для создания системы персональных рекомендаций.

-- 1. Добавляем поля для таргетинга в таблицу продуктов.
ALTER TABLE public.products
ADD COLUMN min_age INT, -- Минимальный рекомендуемый возраст (в месяцах)
ADD COLUMN max_age INT, -- Максимальный рекомендуемый возраст (в месяцах)
ADD COLUMN gender TEXT;  -- Пол ('male', 'female', 'unisex')

-- Для ускорения поиска добавляем индексы на новые поля.
CREATE INDEX idx_products_age_range ON public.products (min_age, max_age);
CREATE INDEX idx_products_gender ON public.products (gender);

-- 2. Создаем новую таблицу для хранения информации о детях.
CREATE TABLE public.children (
    id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    gender TEXT NOT NULL, -- 'male' или 'female'
    birth_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Индекс для быстрого поиска детей конкретного пользователя.
CREATE INDEX idx_children_user_id ON public.children (user_id);

-- Включаем Row Level Security (RLS) для безопасности.
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- Политика RLS: Пользователи могут видеть и управлять только своими детьми.
CREATE POLICY "Users can manage their own children"
ON public.children
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Обновляем триггер для `updated_at`
CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.children
FOR EACH ROW EXECUTE PROCEDURE extensions.moddatetime (updated_at);