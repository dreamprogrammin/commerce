-- ============================================================
-- Promo Campaigns: массовые скидки + промо-страницы
-- ============================================================

-- Таблица кампаний
CREATE TABLE IF NOT EXISTS promo_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('category', 'brand')),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  discount_percentage NUMERIC NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Таблица связей кампания → товары (с сохранением исходной скидки)
CREATE TABLE IF NOT EXISTS promo_campaign_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES promo_campaigns(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  original_discount NUMERIC NOT NULL DEFAULT 0,
  UNIQUE (campaign_id, product_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS idx_promo_campaigns_slug ON promo_campaigns(slug);
CREATE INDEX IF NOT EXISTS idx_promo_campaigns_active ON promo_campaigns(is_active);
CREATE INDEX IF NOT EXISTS idx_promo_campaign_products_campaign ON promo_campaign_products(campaign_id);
CREATE INDEX IF NOT EXISTS idx_promo_campaign_products_product ON promo_campaign_products(product_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE promo_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_campaign_products ENABLE ROW LEVEL SECURITY;

-- Публичное чтение активных кампаний
CREATE POLICY "Public can read active promo campaigns"
  ON promo_campaigns FOR SELECT
  USING (is_active = true);

-- Админы — полный доступ к кампаниям
CREATE POLICY "Admins full access to promo campaigns"
  ON promo_campaigns FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Публичное чтение товаров кампаний (через активные кампании)
CREATE POLICY "Public can read promo campaign products"
  ON promo_campaign_products FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM promo_campaigns
      WHERE promo_campaigns.id = promo_campaign_products.campaign_id
      AND promo_campaigns.is_active = true
    )
  );

-- Админы — полный доступ к товарам кампаний
CREATE POLICY "Admins full access to promo campaign products"
  ON promo_campaign_products FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- RPC: create_promo_campaign
-- ============================================================
CREATE OR REPLACE FUNCTION create_promo_campaign(
  p_title TEXT,
  p_slug TEXT,
  p_description TEXT,
  p_source_type TEXT,
  p_category_id UUID DEFAULT NULL,
  p_brand_id UUID DEFAULT NULL,
  p_discount_percentage NUMERIC DEFAULT 0,
  p_product_ids UUID[] DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_campaign_id UUID;
  v_product_id UUID;
  v_original_discount NUMERIC;
BEGIN
  -- Проверка что вызывающий — админ
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- Создаём кампанию
  INSERT INTO promo_campaigns (title, slug, description, source_type, category_id, brand_id, discount_percentage, created_by)
  VALUES (p_title, p_slug, p_description, p_source_type, p_category_id, p_brand_id, p_discount_percentage, auth.uid())
  RETURNING id INTO v_campaign_id;

  -- Для каждого товара: сохраняем исходную скидку и применяем новую
  FOREACH v_product_id IN ARRAY p_product_ids
  LOOP
    -- Получаем текущую скидку товара
    SELECT discount_percentage INTO v_original_discount
    FROM products
    WHERE id = v_product_id;

    -- Сохраняем в связующую таблицу
    INSERT INTO promo_campaign_products (campaign_id, product_id, original_discount)
    VALUES (v_campaign_id, v_product_id, COALESCE(v_original_discount, 0));

    -- Применяем новую скидку
    UPDATE products
    SET discount_percentage = p_discount_percentage
    WHERE id = v_product_id;
  END LOOP;

  RETURN v_campaign_id;
END;
$$;

-- ============================================================
-- RPC: deactivate_promo_campaign
-- ============================================================
CREATE OR REPLACE FUNCTION deactivate_promo_campaign(p_campaign_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Проверка что вызывающий — админ
  IF NOT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Forbidden: admin only';
  END IF;

  -- Проверяем что кампания существует и активна
  IF NOT EXISTS (
    SELECT 1 FROM promo_campaigns
    WHERE id = p_campaign_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Campaign not found or already inactive';
  END IF;

  -- Восстанавливаем скидки каждого товара
  UPDATE products p
  SET discount_percentage = pcp.original_discount
  FROM promo_campaign_products pcp
  WHERE pcp.campaign_id = p_campaign_id
  AND pcp.product_id = p.id;

  -- Деактивируем кампанию
  UPDATE promo_campaigns
  SET is_active = false
  WHERE id = p_campaign_id;

  RETURN true;
END;
$$;
