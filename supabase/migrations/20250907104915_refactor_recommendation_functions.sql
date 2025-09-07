-- Рефакторинг: Удаляем старую сложную функцию и создаем две новые, простые.

-- 1. Удаляем старую, универсальную функцию, если она существует.
DROP FUNCTION IF EXISTS public.get_recommended_products(uuid, integer);


-- 2. Создаем новую функцию ТОЛЬКО для персональных рекомендаций.
-- Она будет вызываться, только если мы УВЕРЕНЫ, что у пользователя есть данные.
CREATE OR REPLACE FUNCTION get_personalized_recommendations(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS SETOF products AS $$
BEGIN
    -- Сценарий 1: У пользователя есть дети (высший приоритет)
    IF EXISTS (SELECT 1 FROM children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT p.* FROM products p WHERE p.is_active = TRUE AND p.image_url IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM children c
            WHERE c.user_id = p_user_id
            AND EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)) BETWEEN p.min_age AND p.max_age
            AND (p.gender = 'unisex' OR p.gender = c.gender)
        )
        ORDER BY p.sales_count DESC, RANDOM() LIMIT p_limit;
        RETURN;
    END IF;

    -- Сценарий 2: Детей нет, но есть покупки
    RETURN QUERY
    SELECT p.* FROM products p
    WHERE p.is_active = TRUE AND p.image_url IS NOT NULL
    AND p.category_id = (
        SELECT p_inner.category_id
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p_inner ON oi.product_id = p_inner.id
        WHERE o.user_id = p_user_id AND p_inner.category_id IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1
    )
    ORDER BY p.sales_count DESC, p.created_at DESC LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;