-- ====================================
-- УДАЛЕНИЕ УПОМИНАНИЙ ОДЕЖДЫ ИЗ КАТЕГОРИЙ
-- ====================================

-- Обновляем описания категорий, убирая упоминания одежды
-- Мы продаем ТОЛЬКО игрушки!

-- Категория "Мальчикам"
UPDATE public.categories
SET description = 'Игрушки и товары для мальчиков'
WHERE description ILIKE '%одежда%'
  AND name = 'Мальчикам';

-- Категория "Девочкам" (если есть)
UPDATE public.categories
SET description = 'Куклы, игрушки и мечты для девочек'
WHERE name ILIKE '%девочк%';

-- Любые другие категории с упоминанием одежды и нарядов
UPDATE public.categories
SET description = REPLACE(description, ', одежда', '')
WHERE description ILIKE '%одежд%';

UPDATE public.categories
SET description = REPLACE(description, 'одежда и ', '')
WHERE description ILIKE '%одежд%';

UPDATE public.categories
SET description = REPLACE(description, 'одежда, ', '')
WHERE description ILIKE '%одежд%';

-- Убираем упоминания нарядов
UPDATE public.categories
SET description = REPLACE(description, ', наряды', ', игрушки')
WHERE description ILIKE '%наряд%';

UPDATE public.categories
SET description = REPLACE(description, 'наряды и ', 'игрушки и ')
WHERE description ILIKE '%наряд%';

UPDATE public.categories
SET description = REPLACE(description, 'наряды, ', 'игрушки, ')
WHERE description ILIKE '%наряд%';

-- Удаляем старые FAQ с упоминанием одежды
DELETE FROM public.category_questions
WHERE category_id IN (
  SELECT id FROM public.categories
  WHERE name IN ('Мальчикам', 'Девочкам')
);

-- Регенерируем FAQ для этих категорий
DO $$
DECLARE
  v_category_id UUID;
BEGIN
  FOR v_category_id IN
    SELECT id FROM public.categories WHERE name IN ('Мальчикам', 'Девочкам')
  LOOP
    PERFORM public.generate_category_questions(v_category_id, true);
  END LOOP;
END $$;

-- Комментарий
COMMENT ON TABLE public.categories IS
'Категории товаров. Магазин продает ТОЛЬКО игрушки, никакой одежды или других товаров.';
