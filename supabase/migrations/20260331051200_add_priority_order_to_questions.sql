-- ================================================================================
-- МИГРАЦИЯ: Добавление priority_order для оптимизации PAA Snippets (2026-03-31)
-- ================================================================================
-- Цель: Позволить админам вручную задавать приоритет вопросов для Google PAA
-- Вопросы с меньшим priority_order будут выше в JSON-LD FAQPage
-- ================================================================================

-- Добавляем поле priority_order в category_questions
ALTER TABLE public.category_questions
ADD COLUMN IF NOT EXISTS priority_order INTEGER DEFAULT 999;

-- Добавляем индекс для сортировки
CREATE INDEX IF NOT EXISTS idx_category_questions_priority_order 
ON public.category_questions(category_id, priority_order, created_at);

-- Комментарий
COMMENT ON COLUMN public.category_questions.priority_order IS 
'Приоритет вопроса для Google PAA (меньше = выше). 1-10 = приоритетные вопросы из Google, 999 = обычные';

-- Обновляем существующие автогенерированные вопросы с приоритетами
-- Вопрос "Что входит в категорию" = приоритет 100
UPDATE public.category_questions
SET priority_order = 100
WHERE is_auto_generated = true 
  AND question_text LIKE 'Что входит в категорию%';

-- Вопрос о ценах = приоритет 200
UPDATE public.category_questions
SET priority_order = 200
WHERE is_auto_generated = true 
  AND question_text LIKE '%ценовом диапазоне%';

-- Вопрос о брендах = приоритет 300
UPDATE public.category_questions
SET priority_order = 300
WHERE is_auto_generated = true 
  AND question_text LIKE 'Какие бренды представлены%';

-- Вопрос о доставке = приоритет 400
UPDATE public.category_questions
SET priority_order = 400
WHERE is_auto_generated = true 
  AND question_text LIKE 'Как быстро доставите%';

-- Аналогично для brand_questions
ALTER TABLE public.brand_questions
ADD COLUMN IF NOT EXISTS priority_order INTEGER DEFAULT 999;

CREATE INDEX IF NOT EXISTS idx_brand_questions_priority_order 
ON public.brand_questions(brand_id, priority_order, created_at);

COMMENT ON COLUMN public.brand_questions.priority_order IS 
'Приоритет вопроса для Google PAA (меньше = выше). 1-10 = приоритетные вопросы из Google, 999 = обычные';
