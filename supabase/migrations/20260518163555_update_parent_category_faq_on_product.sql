-- ================================================================================
-- FIX: Обновлять FAQ родительской категории при добавлении товара в дочернюю
-- ================================================================================

CREATE OR REPLACE FUNCTION public.update_category_faq_on_product_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_products_count INTEGER;
  v_parent_category_id UUID;
BEGIN
  IF (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.category_id != NEW.category_id)) THEN
    -- Обновляем FAQ текущей категории
    SELECT COUNT(*) INTO v_products_count
    FROM public.products
    WHERE category_id = NEW.category_id AND is_active = true;

    IF v_products_count > 5 THEN
      PERFORM public.generate_category_questions(NEW.category_id, true);
    END IF;

    -- Обновляем FAQ родительской категории (если есть)
    SELECT parent_id INTO v_parent_category_id
    FROM public.categories
    WHERE id = NEW.category_id;

    IF v_parent_category_id IS NOT NULL THEN
      PERFORM public.generate_category_questions(v_parent_category_id, true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_category_faq_on_product_change() IS
'Обновляет FAQ категории и её родителя при добавлении товаров';
