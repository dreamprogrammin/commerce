DO $$
DECLARE
  accessories_parent_id UUID;
  batteries_category_id UUID;
  wrapping_category_id UUID;
BEGIN
  -- Шаг 1: Создаем/обновляем родительскую категорию "Аксессуары"
  -- ИЗМЕНЕНИЯ ТОЛЬКО В ЭТОМ БЛОКЕ
  INSERT INTO public.categories (
    name, 
    slug, 
    href, 
    description, 
    is_root_category, 
    display_in_menu, -- <-- Добавили display_in_menu
    display_order    -- <-- Добавили display_order
  )
  VALUES (
    'Аксессуары', 
    'accessories', 
    '/catalog/accessories', 
    'Сопутствующие товары, батарейки и прочее.', 
    true, 
    true,   -- <-- ИЗМЕНЕНО с false на true
    999     -- <-- ДОБАВЛЕНО для сортировки в конец
  )
  ON CONFLICT (slug) DO UPDATE 
  SET 
    name = EXCLUDED.name, 
    href = EXCLUDED.href,
    display_in_menu = EXCLUDED.display_in_menu, -- <-- Добавили обновление
    display_order = EXCLUDED.display_order;   -- <-- Добавили обновление

  -- Получаем ID, даже если запись уже существовала
  SELECT id INTO accessories_parent_id FROM public.categories WHERE slug = 'accessories';


  -- Шаг 2: Создаем дочернюю категорию "Элементы питания" (без изменений)
  INSERT INTO public.categories (name, slug, href, parent_id, display_in_menu)
  VALUES ('Элементы питания', 'batteries', '/catalog/accessories/batteries', accessories_parent_id, false)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, href = EXCLUDED.href
  RETURNING id INTO batteries_category_id;
  
  -- Если `RETURNING` не сработал из-за `ON CONFLICT`, получаем ID отдельно
  IF batteries_category_id IS NULL THEN
     SELECT id INTO batteries_category_id FROM public.categories WHERE slug = 'batteries';
  END IF;


  -- Шаг 3: Создаем дочернюю категорию "Подарочная упаковка" (без изменений)
  INSERT INTO public.categories (name, slug, href, parent_id, display_in_menu)
  VALUES ('Подарочная упаковка', 'gift-wrapping', '/catalog/accessories/gift-wrapping', accessories_parent_id, false)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, href = EXCLUDED.href
  RETURNING id INTO wrapping_category_id;

  -- Если `RETURNING` не сработал из-за `ON CONFLICT`, получаем ID отдельно
  IF wrapping_category_id IS NULL THEN
     SELECT id INTO wrapping_category_id FROM public.categories WHERE slug = 'gift-wrapping';
  END IF;

  -- Шаг 4: Создаем товары (без изменений)
  INSERT INTO public.products (name, slug, description, price, stock_quantity, is_active, category_id, is_accessory)
  VALUES
    ('Батарейки АА (2 шт.)', 'batteries-aa-2pcs', 'Комплект из двух алкалиновых батареек типа АА.', 450, 500, true, batteries_category_id, true),
    ('Батарейки АА (4 шт.)', 'batteries-aa-4pcs', 'Комплект из четырех алкалиновых батареек типа АА.', 800, 500, true, batteries_category_id, true),
    ('Батарейки ААА (2 шт.)', 'batteries-aaa-2pcs', 'Комплект из двух "мизинчиковых" батареек типа ААА.', 400, 500, true, batteries_category_id, true),
    ('Батарейки ААА (4 шт.)', 'batteries-aaa-4pcs', 'Комплект из четырех "мизинчиковых" батареек типа ААА.', 750, 500, true, batteries_category_id, true),
    ('Подарочный пакет "Праздник"', 'gift-bag-holiday', 'Яркий и прочный пакет для упаковки вашего подарка.', 1200, 300, true, wrapping_category_id, true)
  ON CONFLICT (slug) DO NOTHING;
END $$;