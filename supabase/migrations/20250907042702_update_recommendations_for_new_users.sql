-- Обновляем функцию get_recommended_products.
-- Изменение: Теперь для новых пользователей (без детей и без истории покупок),
-- а также для гостей, будут отображаться не случайные товары,
-- а самые популярные (хиты продаж), отсортированные по `sales_count`.
-- Это более релевантно и помогает новым пользователям с выбором.

CREATE OR REPLACE FUNCTION get_recommended_products(
    p_user_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 10
)
RETURNS SETOF products AS $$
DECLARE
    last_bought_category_id UUID;
BEGIN
    -- Сценарий 1: Пользователь не авторизован (гость)
    IF p_user_id IS NULL THEN
        -- ИСПРАВЛЕНИЕ: Показываем хиты продаж, а не случайные товары
        RETURN QUERY
        SELECT p.* FROM products p
        WHERE p.is_active = TRUE AND p.image_url IS NOT NULL
        ORDER BY p.sales_count DESC, p.created_at DESC -- Сортируем по популярности
        LIMIT p_limit;
        RETURN;
    END IF;

    -- Сценарий 2: У пользователя есть дети (без изменений)
    IF EXISTS (SELECT 1 FROM children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT p.*
        FROM products p
        WHERE
            p.is_active = TRUE
            AND p.image_url IS NOT NULL
            AND EXISTS (
                SELECT 1 FROM children c
                WHERE
                    c.user_id = p_user_id
                    AND EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)) BETWEEN p.min_age AND p.max_age
                    AND (p.gender = 'unisex' OR p.gender = c.gender)
            )
        ORDER BY p.sales_count DESC, RANDOM() -- Здесь оставляем популярные + случайные
        LIMIT p_limit;
        RETURN;
    END IF;

    -- Сценарий 3: Детей нет, но есть покупки (без изменений)
    SELECT p.category_id INTO last_bought_category_id
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN products p ON oi.product_id = p.id
    WHERE o.user_id = p_user_id AND p.category_id IS NOT NULL
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF last_bought_category_id IS NOT NULL THEN
        RETURN QUERY
        SELECT p.*
        FROM products p
        WHERE
            p.is_active = TRUE
            AND p.image_url IS NOT NULL
            AND p.category_id = last_bought_category_id
        ORDER BY p.sales_count DESC, p.created_at DESC -- Можно тоже улучшить до популярных в категории
        LIMIT p_limit;
        RETURN;
    END IF;

    -- Сценарий 4: Пользователь авторизован, но детей и покупок нет
    -- ИСПРАВЛЕНИЕ: Показываем хиты продаж, а не случайные товары
    RETURN QUERY
    SELECT p.* FROM products p
    WHERE p.is_active = TRUE AND p.image_url IS NOT NULL
    ORDER BY p.sales_count DESC, p.created_at DESC -- Сортируем по популярности
    LIMIT p_limit;

END;
$$ LANGUAGE plpgsql;