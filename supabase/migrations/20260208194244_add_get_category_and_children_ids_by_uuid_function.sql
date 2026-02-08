-- Create function to get category and all its children by UUID
CREATE OR REPLACE FUNCTION public.get_category_and_children_ids_by_uuid(p_category_id UUID)
RETURNS TABLE(id UUID)
LANGUAGE sql
SECURITY DEFINER
AS $$
  -- Рекурсивный CTE для обхода дерева категорий по ID
  WITH RECURSIVE category_tree AS (
    -- Начальная точка: категория с указанным ID
    SELECT c.id
    FROM public.categories c
    WHERE c.id = p_category_id

    UNION ALL

    -- Рекурсивная часть: находим всех детей
    SELECT c.id
    FROM public.categories c
    INNER JOIN category_tree ct ON c.parent_id = ct.id
  )
  SELECT category_tree.id
  FROM category_tree;
$$;

-- Комментарий для документации
COMMENT ON FUNCTION public.get_category_and_children_ids_by_uuid(UUID) IS
'Возвращает ID категории и всех её дочерних категорий (рекурсивно) по UUID категории';
