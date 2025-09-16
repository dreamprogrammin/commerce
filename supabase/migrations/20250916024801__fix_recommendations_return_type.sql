-- Финальное исправление функции get_personalized_recommendations.
-- Мы приводим структуру SELECT запросов в соответствие с
-- объявленным типом возвращаемых данных (RETURNS TABLE),
-- добавляя в результат поле `product_images`.

CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    id UUID, name TEXT, slug TEXT, price NUMERIC, description TEXT, category_id UUID,
    stock_quantity INT, is_active BOOLEAN, sales_count INT, bonus_points_award INT,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, min_age INT, max_age INT, gender TEXT,
    product_images JSONB[]
) AS $$
BEGIN
    -- Сценарий 1: У пользователя есть дети
    IF EXISTS (SELECT 1 FROM children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        SELECT
          p.id, p.name, p.slug, p.price, p.description, p.category_id,
          p.stock_quantity, p.is_active, p.sales_count, p.bonus_points_award,
          p.created_at, p.updated_at, p.min_age, p.max_age, p.gender,
          (
            SELECT COALESCE(array_agg(jsonb_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order)), '{}')
            FROM public.product_images pi WHERE pi.product_id = p.id
          ) as product_images
        FROM products p
        WHERE
            p.is_active = TRUE
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
    -- Мы используем `WITH` для чистоты
    WITH last_purchase AS (
        SELECT p_inner.category_id
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN products p_inner ON oi.product_id = p_inner.id
        WHERE o.user_id = p_user_id AND p_inner.category_id IS NOT NULL
        ORDER BY o.created_at DESC LIMIT 1
    )
    -- Если `last_purchase` что-то вернул, значит, есть история покупок
    , recommended_by_purchase AS (
        SELECT p.*
        FROM products p, last_purchase lp
        WHERE p.is_active = TRUE AND p.category_id = lp.category_id
        ORDER BY p.sales_count DESC
        LIMIT p_limit
    )
    -- Если в `recommended_by_purchase` есть строки, возвращаем их
    -- с добавлением `product_images`
    SELECT
      rbp.id, rbp.name, rbp.slug, rbp.price, rbp.description, rbp.category_id,
      rbp.stock_quantity, rbp.is_active, rbp.sales_count, rbp.bonus_points_award,
      rbp.created_at, rbp.updated_at, rbp.min_age, rbp.max_age, rbp.gender,
      (
        SELECT COALESCE(array_agg(jsonb_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order)), '{}')
        FROM public.product_images pi WHERE pi.product_id = rbp.id
      ) as product_images
    FROM recommended_by_purchase rbp;
    
    -- `GET DIAGNOSTICS` - это специальная команда, которая проверяет, сколько строк вернул предыдущий запрос
    IF FOUND THEN
      RETURN;
    END IF;

    -- Сценарий 3: Пользователь авторизован, но детей и покупок нет
    RETURN QUERY
    SELECT
      p.id, p.name, p.slug, p.price, p.description, p.category_id,
      p.stock_quantity, p.is_active, p.sales_count, p.bonus_points_award,
      p.created_at, p.updated_at, p.min_age, p.max_age, p.gender,
      (
        SELECT COALESCE(array_agg(jsonb_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order)), '{}')
        FROM public.product_images pi WHERE pi.product_id = p.id
      ) as product_images
    FROM products p
    WHERE p.is_active = TRUE
    ORDER BY p.sales_count DESC
    LIMIT p_limit;
    
END;
$$ LANGUAGE plpgsql;