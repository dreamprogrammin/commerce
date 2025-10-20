-- Up Migration: Удаляем старую, дублирующуюся RPC-функцию

-- Мы явно указываем сигнатуру старой функции (с 8 аргументами), чтобы
-- PostgreSQL точно знал, какую из двух версий нужно удалить.
DROP FUNCTION IF EXISTS public.get_filtered_products(
    p_category_slug TEXT,
    p_subcategory_ids UUID[],
    p_brand_ids UUID[],
    p_price_min NUMERIC,
    p_price_max NUMERIC,
    p_sort_by TEXT,
    p_page_number INT,
    p_page_size INT
);


/*
-- Down Migration (Закомментировано)
-- Откат не требуется, так как мы просто удаляем дубликат.
*/