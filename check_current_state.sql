-- Проверка текущих категорий
SELECT slug, name, parent_id, is_active 
FROM categories 
ORDER BY parent_id NULLS FIRST, name;

-- Проверка текущих брендов
SELECT slug, name, is_active 
FROM brands 
ORDER BY name;
