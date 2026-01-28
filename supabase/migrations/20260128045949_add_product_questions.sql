-- Таблица product_questions
CREATE TABLE public.product_questions (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  answered_by UUID REFERENCES auth.users(id),
  answered_at TIMESTAMPTZ,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы
CREATE INDEX idx_pq_product_id ON public.product_questions(product_id);
CREATE INDEX idx_pq_created_at ON public.product_questions(created_at DESC);

-- RLS
ALTER TABLE public.product_questions ENABLE ROW LEVEL SECURITY;

-- Публичное чтение опубликованных
CREATE POLICY "Public read published questions"
ON public.product_questions FOR SELECT
USING (is_published = true);

-- Авторизованные создают вопросы
CREATE POLICY "Auth users create questions"
ON public.product_questions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Админ обновляет (ответ, модерация)
CREATE POLICY "Admin update questions"
ON public.product_questions FOR UPDATE
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Автор может удалить свой вопрос
CREATE POLICY "User delete own question"
ON public.product_questions FOR DELETE
USING (auth.uid() = user_id);

-- Админ может удалить любой вопрос
CREATE POLICY "Admin delete questions"
ON public.product_questions FOR DELETE
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Триггер updated_at
CREATE TRIGGER update_product_questions_updated_at
BEFORE UPDATE ON public.product_questions
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
