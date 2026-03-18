-- Бэкфилл: проставить display_order для всех product_images
-- Сортирует по created_at ASC и присваивает 0, 1, 2... для каждого товара
-- Идемпотентный: можно запускать повторно без побочных эффектов

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY product_id
      ORDER BY created_at ASC
    ) - 1 AS new_order
  FROM product_images
)
UPDATE product_images
SET display_order = ranked.new_order
FROM ranked
WHERE product_images.id = ranked.id
  AND (product_images.display_order IS NULL OR product_images.display_order != ranked.new_order);
