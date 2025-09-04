-- Включаем расширение "moddatetime".
-- Это расширение предоставляет функцию для автоматического обновления
-- колонки `updated_at` при изменении строки.
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;