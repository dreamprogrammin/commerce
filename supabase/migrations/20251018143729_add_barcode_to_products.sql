-- Up Migration: Добавляем колонку для штрихкода

ALTER TABLE public.products
ADD COLUMN barcode TEXT NULL;


/*
-- Down Migration (Откат)
-- ВАЖНО: Этот блок закомментирован, как вы просили.

ALTER TABLE public.products
DROP COLUMN IF EXISTS barcode;

*/