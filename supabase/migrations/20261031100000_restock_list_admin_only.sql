-- ============================================================================
-- «К закупке»: список только администратору.
--
-- Найдено 31 октября 2026: `get_restock_list` — SECURITY DEFINER без проверки
-- роли, EXECUTE у anon. Любой посетитель с публичным ключом сайта (он в
-- разметке каждой страницы) получал поставщиков — имя, контактное лицо,
-- телефон, адрес — и товары на исходе с остатками. Проверено запросом с
-- ключом гостя на бою.
--
-- Тело снято с прода 31.10.2026 (pg_get_functiondef), добавлена только
-- проверка роли. Права у anon снимаются тоже — вторым замком.
-- ============================================================================

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'get_restock_list') <> 1 THEN
    RAISE EXCEPTION 'get_restock_list — не одна версия';
  END IF;
  IF (SELECT md5(pg_get_functiondef('public.get_restock_list()'::regprocedure)))
       IS DISTINCT FROM 'f13ca61101f57c680c7a61b923f8bbde' THEN
    RAISE EXCEPTION 'get_restock_list отличается от снятой с прода 31.10.2026 — миграция не для этой базы';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.get_restock_list()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  result JSON;
BEGIN
  -- Только администратор (31.10.2026): функция с правами владельца отдавала
  -- поставщиков с телефонами, контактами и адресами любому гостю
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Доступ запрещён: список закупок — только для администраторов';
  END IF;

  SELECT COALESCE(json_agg(row_to_json(supplier_group) ORDER BY supplier_group.supplier_name), '[]'::json)
  INTO result
  FROM (
    SELECT
      s.id AS supplier_id,
      COALESCE(s.name, 'Без поставщика') AS supplier_name,
      s.contact_person AS supplier_contact,
      s.phone AS supplier_phone,
      s.address AS supplier_address,
      (
        SELECT json_agg(row_to_json(prod) ORDER BY prod.stock_quantity ASC)
        FROM (
          SELECT
            p.id,
            p.name,
            p.sku,
            p.price,
            p.stock_quantity,
            p.min_stock_level,
            p.restock_quantity,
            p.sales_count,
            (SELECT pi.image_url FROM product_images pi WHERE pi.product_id = p.id ORDER BY pi.display_order LIMIT 1) AS image_url
          FROM products p
          WHERE p.is_active = true
            AND p.stock_quantity <= p.min_stock_level
            AND (
              (s.id IS NULL AND p.supplier_id IS NULL)
              OR p.supplier_id = s.id
            )
        ) prod
      ) AS products,
      (
        SELECT COUNT(*)
        FROM products p
        WHERE p.is_active = true
          AND p.stock_quantity <= p.min_stock_level
          AND (
            (s.id IS NULL AND p.supplier_id IS NULL)
            OR p.supplier_id = s.id
          )
      ) AS product_count
    FROM (
      SELECT DISTINCT s2.id, s2.name, s2.contact_person, s2.phone, s2.address
      FROM products p2
      LEFT JOIN suppliers s2 ON s2.id = p2.supplier_id
      WHERE p2.is_active = true AND p2.stock_quantity <= p2.min_stock_level
    ) s
  ) supplier_group
  WHERE supplier_group.product_count > 0;

  RETURN result;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_restock_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_restock_list() TO authenticated, service_role;
