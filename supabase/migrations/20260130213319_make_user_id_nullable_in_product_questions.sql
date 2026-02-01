-- Исправление ошибки: user_id должен быть nullable для автогенерированных вопросов
-- Проблема: таблица создана с NOT NULL constraint, но системные вопросы не имеют user_id
-- Решение: разрешить NULL значения для user_id

ALTER TABLE public.product_questions
ALTER COLUMN user_id DROP NOT NULL;

COMMENT ON COLUMN public.product_questions.user_id IS
'ID пользователя, который задал вопрос. NULL для автогенерированных системных вопросов.';
