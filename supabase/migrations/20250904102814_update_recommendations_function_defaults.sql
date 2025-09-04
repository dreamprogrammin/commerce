-- Обновляем функцию get_recommended_products,
-- добавляя значения DEFAULT для всех параметров.
-- Это решает ошибку "Could not find the function ... without parameters",
-- позволяя вызывать функцию, даже если некоторые или все параметры не переданы.

CREATE OR REPLACE FUNCTION get_recommended_products(
    p_user_id UUID DEFAULT NULL, -- <-- Добавлено DEFAULT NULL
    p_limit INT DEFAULT 10       -- <-- Добавлено DEFAULT 10
)
RETURNS SETOF products AS $$
DECLARE
    child_count INT;
    last_bought_category_id UUID;
BEGIN
    -- Сценарий 1: Пользователь не авторизован (p_user_id IS NULL)
    IF p_user_id IS NULL THEN
        -- Просто возвращаем случайные популярные товары
        RETURN QUERY
        SELECT p.* FROM products p
        WHERE p.is_active = TRUE AND p.image_url IS NOT NULL
        ORDER BY RANDOM() -- Случайный порядок
        LIMIT p_limit;
        RETURN;
    END IF;

    -- Проверяем, есть ли у пользователя дети
    SELECT count(*) INTO child_count FROM children WHERE user_id = p_user_id;

    -- Сценарий 2: У пользователя есть дети
    IF child_count > 0 THEN
        -- ... (логика без изменений)
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
                    AND EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)) >= p.min_age
                    AND EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)) <= p.max_age
                    AND (p.gender = 'unisex' OR p.gender = c.gender)
            )
        ORDER BY p.sales_count DESC, RANDOM()
        LIMIT p_limit;
        RETURN;
    END IF;

    -- ... (остальная часть функции без изменений)
    
    -- Проверяем, делал ли пользователь покупки
    SELECT oi.product_id INTO last_bought_category_id
    FROM orders o
    JOIN order_items oi ON o.id = oi.order_id
    JOIN products prod ON oi.product_id = prod.id
    WHERE o.user_id = p_user_id
    ORDER BY o.created_at DESC
    LIMIT 1;

    -- Сценарий 3: Детей нет, но есть покупки
    IF last_bought_category_id IS NOT NULL THEN
        RETURN QUERY
        SELECT p.*
        FROM products p
        WHERE
            p.is_active = TRUE
            AND p.image_url IS NOT NULL
            AND p.category_id = (SELECT category_id FROM products WHERE id = last_bought_category_id)
        ORDER BY RANDOM()
        LIMIT p_limit;
        RETURN;
    END IF;

    -- Сценарий 4: Пользователь авторизован, но детей и покупок нет
    RETURN QUERY
    SELECT p.* FROM products p
    WHERE p.is_active = TRUE AND p.image_url IS NOT NULL
    ORDER BY RANDOM()
    LIMIT p_limit;

END;
$$ LANGUAGE plpgsql;