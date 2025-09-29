-- migration.sql
-- Название: create_get_category_and_children_ids_function

-- Создаем или заменяем функцию для рекурсивного получения ID дочерних категорий.
-- SECURITY DEFINER используется, чтобы функция имела повышенные права и могла
-- обходить RLS-политики на чтение таблицы `categories`, если они есть.
CREATE OR REPLACE FUNCTION public.get_category_and_children_ids(p_category_slug TEXT)
RETURNS TABLE(id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- Используем рекурсивный Common Table Expression (CTE) для обхода дерева категорий.
  WITH RECURSIVE category_tree AS (
    -- Начальная точка: находим категорию по ее уникальному слагу.
    SELECT c.id
    FROM public.categories c
    WHERE c.slug = p_category_slug
    
    UNION ALL
    
    -- Рекурсивная часть: присоединяем дочерние категории.
    -- Находим все категории `c`, у которых `parent_id` совпадает с `id`,
    -- уже найденным на предыдущем шаге в `category_tree`.
    SELECT c.id
    FROM public.categories c
    JOIN category_tree ct ON c.parent_id = ct.id
  )
  -- Выбираем все ID, собранные в `category_tree`.
  SELECT tree.id FROM category_tree tree;
$$;