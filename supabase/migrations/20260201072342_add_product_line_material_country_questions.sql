-- ====================================
-- ТАБЛИЦЫ ДЛЯ FAQ: ЛИНЕЙКИ, МАТЕРИАЛЫ, СТРАНЫ
-- ====================================

-- Убедимся что расширение moddatetime включено
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

-- 1. Таблица вопросов для линеек продуктов
CREATE TABLE IF NOT EXISTS public.product_line_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_line_id UUID NOT NULL REFERENCES public.product_lines(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  is_auto_generated BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для линеек
CREATE INDEX idx_product_line_questions_product_line_id ON public.product_line_questions(product_line_id);
CREATE INDEX idx_product_line_questions_user_id ON public.product_line_questions(user_id);
CREATE INDEX idx_product_line_questions_answered_at ON public.product_line_questions(answered_at);

-- Триггер обновления для линеек
CREATE TRIGGER trigger_update_product_line_questions_updated_at
  BEFORE UPDATE ON public.product_line_questions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- RLS для линеек
ALTER TABLE public.product_line_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view answered product line questions"
  ON public.product_line_questions FOR SELECT
  USING (answered_at IS NOT NULL);

CREATE POLICY "Authenticated users can ask product line questions"
  ON public.product_line_questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own product line questions"
  ON public.product_line_questions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all product line questions"
  ON public.product_line_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 2. Таблица вопросов для материалов
CREATE TABLE IF NOT EXISTS public.material_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id INTEGER NOT NULL REFERENCES public.materials(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  is_auto_generated BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для материалов
CREATE INDEX idx_material_questions_material_id ON public.material_questions(material_id);
CREATE INDEX idx_material_questions_user_id ON public.material_questions(user_id);
CREATE INDEX idx_material_questions_answered_at ON public.material_questions(answered_at);

-- Триггер обновления для материалов
CREATE TRIGGER trigger_update_material_questions_updated_at
  BEFORE UPDATE ON public.material_questions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- RLS для материалов
ALTER TABLE public.material_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view answered material questions"
  ON public.material_questions FOR SELECT
  USING (answered_at IS NOT NULL);

CREATE POLICY "Authenticated users can ask material questions"
  ON public.material_questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own material questions"
  ON public.material_questions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all material questions"
  ON public.material_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 3. Таблица вопросов для стран
CREATE TABLE IF NOT EXISTS public.country_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id INTEGER NOT NULL REFERENCES public.countries(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  is_auto_generated BOOLEAN DEFAULT false,
  answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Индексы для стран
CREATE INDEX idx_country_questions_country_id ON public.country_questions(country_id);
CREATE INDEX idx_country_questions_user_id ON public.country_questions(user_id);
CREATE INDEX idx_country_questions_answered_at ON public.country_questions(answered_at);

-- Триггер обновления для стран
CREATE TRIGGER trigger_update_country_questions_updated_at
  BEFORE UPDATE ON public.country_questions
  FOR EACH ROW
  EXECUTE FUNCTION extensions.moddatetime(updated_at);

-- RLS для стран
ALTER TABLE public.country_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view answered country questions"
  ON public.country_questions FOR SELECT
  USING (answered_at IS NOT NULL);

CREATE POLICY "Authenticated users can ask country questions"
  ON public.country_questions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own country questions"
  ON public.country_questions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all country questions"
  ON public.country_questions FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Комментарии
COMMENT ON TABLE public.product_line_questions IS 'Вопросы и ответы для линеек продуктов (Barbie, Hot Wheels и т.д.)';
COMMENT ON TABLE public.material_questions IS 'Вопросы и ответы для материалов (пластик, дерево и т.д.)';
COMMENT ON TABLE public.country_questions IS 'Вопросы и ответы для стран-производителей';
