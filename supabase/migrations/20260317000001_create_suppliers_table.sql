-- ============================================================================
-- Создание таблицы suppliers (поставщики) и связь с products
-- ============================================================================

-- 1. Таблица поставщиков
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Комментарий к таблице
COMMENT ON TABLE public.suppliers IS 'База поставщиков (Барахолка, Ялян, дистрибьюторы, фабрики)';

-- 2. Добавляем supplier_id в products
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'supplier_id'
  ) THEN
    ALTER TABLE public.products ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;
    RAISE NOTICE '✓ products.supplier_id добавлен';
  END IF;
END $$;

-- 3. Индекс для быстрого поиска товаров по поставщику
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON public.products(supplier_id);

-- 4. Триггер updated_at
CREATE OR REPLACE FUNCTION public.update_suppliers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_suppliers_updated_at ON public.suppliers;
CREATE TRIGGER trigger_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_suppliers_updated_at();

-- 5. RLS политики
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- Админ: полный доступ
CREATE POLICY "Admins can do everything with suppliers"
  ON public.suppliers
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Обновление кэша PostgREST
NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';
