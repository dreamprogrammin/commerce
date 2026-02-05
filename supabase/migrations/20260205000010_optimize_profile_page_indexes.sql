-- =====================================================================================
-- OPTIMIZE PROFILE PAGE INDEXES
-- =====================================================================================
-- Добавляет индексы для оптимизации загрузки страницы профиля
-- =====================================================================================

-- ✅ Индекс для быстрой сортировки заказов по дате для конкретного пользователя
CREATE INDEX IF NOT EXISTS idx_orders_user_created
ON public.orders (user_id, created_at DESC);

-- ✅ Индекс для быстрой сортировки избранного по дате для конкретного пользователя
CREATE INDEX IF NOT EXISTS idx_wishlist_user_created
ON public.wishlist (user_id, created_at DESC);

-- ✅ Индекс для быстрого получения первого изображения товара
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort
ON public.product_images (product_id, sort_order ASC);

-- ✅ Индекс для order_items с внешними ключами (для JOIN оптимизации)
CREATE INDEX IF NOT EXISTS idx_order_items_order_product
ON public.order_items (order_id, product_id);

COMMENT ON INDEX idx_orders_user_created IS
'Оптимизирует запросы последних заказов пользователя с сортировкой';

COMMENT ON INDEX idx_wishlist_user_created IS
'Оптимизирует запросы избранных товаров пользователя с сортировкой';

COMMENT ON INDEX idx_product_images_product_sort IS
'Оптимизирует получение первого изображения товара по sort_order';

COMMENT ON INDEX idx_order_items_order_product IS
'Оптимизирует JOIN между заказами и товарами';

-- Обновляем кэш PostgREST
NOTIFY pgrst, 'reload schema';
