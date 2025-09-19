ALTER TABLE public.products
ADD COLUMN type TEXT NULL; -- Или TEXT NOT NULL DEFAULT 'Другое', если хотите обязательное поле