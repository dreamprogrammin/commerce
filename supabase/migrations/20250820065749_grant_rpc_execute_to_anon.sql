-- Назначение: Явное предоставление прав на выполнение (EXECUTE)
-- ключевых RPC-функций для анонимных и авторизованных пользователей.
-- Это решает проблему с ошибкой 401 Unauthorized для гостей.

-- --- 1. Права для `create_order` ---
-- Разрешаем и гостям (`anon`), и пользователям (`authenticated`)
-- ВЫПОЛНЯТЬ эту функцию.
GRANT EXECUTE ON FUNCTION public.create_order(p_cart_items JSONB, p_delivery_method TEXT, p_payment_method TEXT, p_delivery_address JSONB, p_guest_info JSONB, p_bonuses_to_spend INT)
TO anon, authenticated;


-- --- 2. Права для `get_filtered_products` ---
-- Эту функцию могут вызывать все.
GRANT EXECUTE ON FUNCTION public.get_filtered_products(p_category_slug TEXT, p_subcategory_ids UUID[], p_price_min NUMERIC, p_price_max NUMERIC, p_sort_by TEXT, p_page_size INT, p_page_number INT)
TO public; -- `public` включает в себя `anon` и `authenticated`