-- Создание таблицы вопросов для категорий
CREATE TABLE IF NOT EXISTS public.category_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT,
    is_auto_generated BOOLEAN DEFAULT false,
    answered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Индексы для category_questions
CREATE INDEX IF NOT EXISTS idx_category_questions_category_id ON public.category_questions(category_id);
CREATE INDEX IF NOT EXISTS idx_category_questions_user_id ON public.category_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_category_questions_is_auto_generated ON public.category_questions(is_auto_generated);

-- RLS для category_questions
ALTER TABLE public.category_questions ENABLE ROW LEVEL SECURITY;

-- Политики для category_questions
CREATE POLICY "Enable read access for all users"
ON public.category_questions FOR SELECT
USING (true);

CREATE POLICY "Enable insert for authenticated users"
ON public.category_questions FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Enable update for admins"
ON public.category_questions FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Enable delete for question owner or admin"
ON public.category_questions FOR DELETE
USING (auth.uid() = user_id OR public.is_admin());

-- Создание таблицы вопросов для брендов
CREATE TABLE IF NOT EXISTS public.brand_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    question_text TEXT NOT NULL,
    answer_text TEXT,
    is_auto_generated BOOLEAN DEFAULT false,
    answered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- Индексы для brand_questions
CREATE INDEX IF NOT EXISTS idx_brand_questions_brand_id ON public.brand_questions(brand_id);
CREATE INDEX IF NOT EXISTS idx_brand_questions_user_id ON public.brand_questions(user_id);
CREATE INDEX IF NOT EXISTS idx_brand_questions_is_auto_generated ON public.brand_questions(is_auto_generated);

-- RLS для brand_questions
ALTER TABLE public.brand_questions ENABLE ROW LEVEL SECURITY;

-- Политики для brand_questions
CREATE POLICY "Enable read access for all users"
ON public.brand_questions FOR SELECT
USING (true);

CREATE POLICY "Enable insert for authenticated users"
ON public.brand_questions FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "Enable update for admins"
ON public.brand_questions FOR UPDATE
USING (public.is_admin());

CREATE POLICY "Enable delete for question owner or admin"
ON public.brand_questions FOR DELETE
USING (auth.uid() = user_id OR public.is_admin());

-- Триггеры для автоматического обновления updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_category_questions_updated_at
    BEFORE UPDATE ON public.category_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_brand_questions_updated_at
    BEFORE UPDATE ON public.brand_questions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Комментарии
COMMENT ON TABLE public.category_questions IS 'FAQ вопросы для категорий товаров';
COMMENT ON TABLE public.brand_questions IS 'FAQ вопросы для брендов';
COMMENT ON COLUMN public.category_questions.is_auto_generated IS 'Автогенерированный вопрос (SQL или AI)';
COMMENT ON COLUMN public.brand_questions.is_auto_generated IS 'Автогенерированный вопрос (SQL или AI)';
