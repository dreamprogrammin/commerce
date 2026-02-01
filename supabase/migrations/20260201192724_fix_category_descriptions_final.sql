-- ====================================
-- ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ ОПИСАНИЙ КАТЕГОРИЙ
-- ====================================
-- Убираем все упоминания одежды и нарядов из категорий
-- Магазин продает ТОЛЬКО игрушки!

-- Обновляем категорию "Мальчикам"
UPDATE public.categories
SET description = 'Игрушки и товары для мальчиков'
WHERE slug = 'boys';

-- Обновляем категорию "Девочкам"
UPDATE public.categories
SET description = 'Куклы, игрушки и мечты для девочек'
WHERE slug = 'girls';

-- Убираем упоминания одежды из всех категорий
UPDATE public.categories
SET description = REPLACE(REPLACE(REPLACE(
  description,
  'одежда и ', ''),
  ', одежда', ''),
  'одежда, ', '')
WHERE description ILIKE '%одежд%';

-- Убираем упоминания нарядов из всех категорий
UPDATE public.categories
SET description = REPLACE(REPLACE(REPLACE(
  description,
  'наряды и ', 'игрушки и '),
  ', наряды', ', игрушки'),
  'наряды, ', 'игрушки, ')
WHERE description ILIKE '%наряд%';

-- Удаляем старые FAQ с упоминанием одежды для категорий
DELETE FROM public.category_questions
WHERE category_id IN (
  SELECT id FROM public.categories
  WHERE slug IN ('boys', 'girls')
)
AND (
  question_text ILIKE '%одежд%'
  OR answer_text ILIKE '%одежд%'
  OR question_text ILIKE '%наряд%'
  OR answer_text ILIKE '%наряд%'
);

-- Комментарий для разработчиков
COMMENT ON TABLE public.categories IS
'Категории товаров. Магазин Ухтышка продает ТОЛЬКО игрушки и детские товары. Никакой одежды!';
