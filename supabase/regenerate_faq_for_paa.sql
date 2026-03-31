-- ================================================================================
-- СКРИПТ: Массовая регенерация FAQ для Google PAA оптимизации
-- ================================================================================
-- Дата: 31 марта 2026
-- Цель: Обновить все автогенерированные FAQ с новыми PAA-оптимизированными ответами
-- 
-- ЧТО ДЕЛАЕТ ЭТОТ СКРИПТ:
-- 1. Удаляет старые автогенерированные вопросы
-- 2. Генерирует новые с HTML-списками, четкими определениями и внутренними ссылками
-- 3. Расставляет приоритеты (priority_order) для правильной сортировки в JSON-LD
-- 
-- КАК ЗАПУСТИТЬ:
-- 1. Открыть Supabase Studio → SQL Editor
-- 2. Скопировать весь этот файл
-- 3. Нажать "Run"
-- 4. Дождаться завершения (обычно 5-10 секунд)
-- ================================================================================

-- Запускаем массовую регенерацию
SELECT * FROM public.generate_questions_for_all_categories();

-- Проверяем результат
SELECT 
  c.name as category_name,
  COUNT(cq.id) as questions_count,
  COUNT(CASE WHEN cq.priority_order BETWEEN 100 AND 400 THEN 1 END) as auto_generated,
  COUNT(CASE WHEN cq.priority_order BETWEEN 1 AND 10 THEN 1 END) as priority_from_google
FROM public.categories c
LEFT JOIN public.category_questions cq ON cq.category_id = c.id
GROUP BY c.id, c.name
ORDER BY questions_count DESC
LIMIT 20;

-- Показываем пример нового ответа
SELECT 
  question_text,
  LEFT(answer_text, 200) as answer_preview,
  priority_order
FROM public.category_questions
WHERE is_auto_generated = true
ORDER BY created_at DESC
LIMIT 5;
