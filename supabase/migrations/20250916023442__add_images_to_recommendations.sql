-- Обновляем функцию get_personalized_recommendations, чтобы она
-- возвращала для каждого товара вложенный массив его изображений.

-- Сначала удаляем старую версию
DROP FUNCTION IF EXISTS public.get_personalized_recommendations(uuid, integer);

-- Создаем новую версию с правильным типом возвращаемых данных
CREATE OR REPLACE FUNCTION public.get_personalized_recommendations(
    p_user_id UUID,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    -- Все колонки из `products`
    id UUID, name TEXT, slug TEXT, price NUMERIC, description TEXT, category_id UUID,
    stock_quantity INT, is_active BOOLEAN, sales_count INT, bonus_points_award INT,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, min_age INT, max_age INT, gender TEXT,
    -- ПЛЮС новое поле, которое будет содержать массив JSON
    product_images JSONB[]
) AS $$
DECLARE
    -- ... (ваши переменные, если они есть)
BEGIN
    -- Вся ваша существующая логика IF/ELSE остается,
    -- но теперь мы будем выбирать из "обогащенной" таблицы.

    -- Пример для Сценария 2 (по детям):
    IF EXISTS (SELECT 1 FROM children WHERE user_id = p_user_id) THEN
        RETURN QUERY
        -- Выбираем из подзапроса, который уже содержит `product_images`
        SELECT p_with_images.*
        FROM (
            SELECT p.*, (
                SELECT COALESCE(array_agg(jsonb_build_object('id', pi.id, 'image_url', pi.image_url, 'display_order', pi.display_order)), '{}')
                FROM public.product_images pi WHERE pi.product_id = p.id
            ) as product_images
            FROM products p
        ) p_with_images
        WHERE
            p_with_images.is_active = TRUE
            AND EXISTS (
                SELECT 1 FROM children c
                WHERE c.user_id = p_user_id
                AND EXTRACT(YEAR FROM age(c.birth_date)) * 12 + EXTRACT(MONTH FROM age(c.birth_date)) BETWEEN p_with_images.min_age AND p_with_images.max_age
                AND (p_with_images.gender = 'unisex' OR p_with_images.gender = c.gender)
            )
        ORDER BY p_with_images.sales_count DESC, RANDOM() LIMIT p_limit;
        RETURN;
    END IF;

    -- ... (и так далее для каждого из сценариев: по покупкам и по популярности)
    -- Везде нужно будет заменить `FROM products p` на подзапрос, как в примере выше.

END;
$$ LANGUAGE plpgsql;