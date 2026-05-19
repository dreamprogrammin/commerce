-- Создание таблицы вопросов для комбинаций категория + бренд
CREATE TABLE IF NOT EXISTS public.category_brand_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    is_auto_generated BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(category_id, brand_id, question_text)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_category_brand_questions_category ON public.category_brand_questions(category_id);
CREATE INDEX IF NOT EXISTS idx_category_brand_questions_brand ON public.category_brand_questions(brand_id);
CREATE INDEX IF NOT EXISTS idx_category_brand_questions_combo ON public.category_brand_questions(category_id, brand_id);

-- RLS
ALTER TABLE public.category_brand_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users"
ON public.category_brand_questions FOR SELECT
USING (true);

CREATE POLICY "Enable write for admins"
ON public.category_brand_questions FOR ALL
USING (public.is_admin());

-- Функция для автогенерации FAQ для комбинаций категория + бренд
CREATE OR REPLACE FUNCTION generate_category_brand_faq(
  p_category_id uuid,
  p_brand_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_category_name text;
  v_brand_name text;
  v_products_count int;
  v_min_price numeric;
  v_max_price numeric;
  v_city text := 'Алматы';
  v_faq jsonb;
BEGIN
  -- Получаем данные
  SELECT 
    c.name,
    b.name,
    COUNT(p.id),
    MIN(p.final_price),
    MAX(p.final_price)
  INTO 
    v_category_name,
    v_brand_name,
    v_products_count,
    v_min_price,
    v_max_price
  FROM categories c
  CROSS JOIN brands b
  LEFT JOIN products p ON p.category_id = c.id AND p.brand_id = b.id AND p.is_active = true
  WHERE c.id = p_category_id AND b.id = p_brand_id
  GROUP BY c.name, b.name;

  -- Генерируем FAQ
  v_faq := jsonb_build_array(
    jsonb_build_object(
      'question', format('Где купить %s %s в %s?', lower(v_category_name), v_brand_name, v_city),
      'answer', format('Лучший выбор %s %s в %s представлен в специализированном интернет-магазине Ухтышка (uhti.kz). Мы предлагаем %s моделей с бесплатной доставкой от 10 000 ₸ и начислением бонусов на следующую покупку.', 
        lower(v_category_name), v_brand_name, v_city, v_products_count)
    ),
    jsonb_build_object(
      'question', format('Сколько стоят %s %s?', lower(v_category_name), v_brand_name),
      'answer', format('Цены на %s %s в Ухтышке начинаются от %s ₸. Самые популярные модели стоят от %s до %s ₸.',
        lower(v_category_name), v_brand_name, 
        to_char(v_min_price, 'FM999G999G999'),
        to_char(round(v_min_price * 1.5), 'FM999G999G999'),
        to_char(round(v_max_price * 0.7), 'FM999G999G999'))
    ),
    jsonb_build_object(
      'question', format('Как быстро доставят %s %s в %s?', lower(v_category_name), v_brand_name, v_city),
      'answer', format('Доставка %s %s по %s занимает 1 день при заказе до 18:00. Бесплатная доставка при заказе от 10 000 ₸. Также доступен самовывоз из пункта выдачи.',
        lower(v_category_name), v_brand_name, v_city)
    ),
    jsonb_build_object(
      'question', format('Оригинальные ли %s %s в Ухтышке?', lower(v_category_name), v_brand_name),
      'answer', format('Да, мы работаем только с официальными поставщиками %s и проверяем каждый товар перед отправкой. На все %s %s предоставляется гарантия качества.',
        v_brand_name, lower(v_category_name), v_brand_name)
    )
  );

  -- Сохраняем FAQ в таблицу category_brand_questions
  INSERT INTO category_brand_questions (category_id, brand_id, question_text, answer_text, is_auto_generated)
  SELECT 
    p_category_id,
    p_brand_id,
    (faq->>'question')::text,
    (faq->>'answer')::text,
    true
  FROM jsonb_array_elements(v_faq) AS faq
  ON CONFLICT (category_id, brand_id, question_text) 
  DO UPDATE SET 
    answer_text = EXCLUDED.answer_text,
    updated_at = now();

  RETURN v_faq;
END;
$$ LANGUAGE plpgsql;

-- Функция для массовой генерации FAQ для всех category_brand_seo
CREATE OR REPLACE FUNCTION generate_faq_for_all_category_brands()
RETURNS TABLE (
  category_id uuid,
  brand_id uuid,
  faq_count int
) AS $$
BEGIN
  RETURN QUERY
  WITH generated AS (
    SELECT 
      cbs.category_id,
      cbs.brand_id,
      generate_category_brand_faq(cbs.category_id, cbs.brand_id) as faq
    FROM category_brand_seo cbs
  )
  SELECT 
    g.category_id,
    g.brand_id,
    jsonb_array_length(g.faq) as faq_count
  FROM generated g;
END;
$$ LANGUAGE plpgsql;
