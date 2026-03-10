-- Таблица для хранения SEO-текстов для связки бренд+категория (Brand Landing Pages)
CREATE TABLE IF NOT EXISTS category_brand_seo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  seo_h1 TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(category_id, brand_id)
);

-- RLS
ALTER TABLE category_brand_seo ENABLE ROW LEVEL SECURITY;

-- Публичный доступ на чтение
CREATE POLICY "Public read access for category_brand_seo"
  ON category_brand_seo FOR SELECT
  USING (true);

-- Админский доступ на запись
CREATE POLICY "Admin write access for category_brand_seo"
  ON category_brand_seo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Индексы
CREATE INDEX idx_category_brand_seo_category ON category_brand_seo(category_id);
CREATE INDEX idx_category_brand_seo_brand ON category_brand_seo(brand_id);

-- Автообновление updated_at
CREATE TRIGGER update_category_brand_seo_updated_at
  BEFORE UPDATE ON category_brand_seo
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RPC для получения SEO-текста для связки бренд+категория
CREATE OR REPLACE FUNCTION get_category_brand_seo(
  p_category_slug TEXT,
  p_brand_slug TEXT
)
RETURNS TABLE (
  seo_h1 TEXT,
  seo_title TEXT,
  seo_description TEXT,
  seo_text TEXT
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    cbs.seo_h1,
    cbs.seo_title,
    cbs.seo_description,
    cbs.seo_text
  FROM category_brand_seo cbs
  JOIN categories c ON c.id = cbs.category_id
  JOIN brands b ON b.id = cbs.brand_id
  WHERE c.slug = p_category_slug
    AND b.slug = p_brand_slug
  LIMIT 1;
END;
$$;
