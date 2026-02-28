-- ============================================================
-- 1a. FK fix: PGRST200 — добавляем FK к public.profiles
-- Существующий FK к auth.users остаётся для cascade delete
-- ============================================================
ALTER TABLE public.product_reviews
  ADD CONSTRAINT product_reviews_profile_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- ============================================================
-- 1b. Таблица review_images
-- ============================================================
CREATE TABLE public.review_images (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  review_id UUID NOT NULL REFERENCES public.product_reviews(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  blur_placeholder TEXT,
  display_order SMALLINT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_review_images_review ON public.review_images(review_id);

-- RLS
ALTER TABLE public.review_images ENABLE ROW LEVEL SECURITY;

-- Публичное чтение (только опубликованных отзывов)
CREATE POLICY "review_images_public_read" ON public.review_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.product_reviews
      WHERE product_reviews.id = review_images.review_id
        AND product_reviews.is_published = true
    )
  );

-- Автор может читать свои (даже неопубликованные)
CREATE POLICY "review_images_author_read" ON public.review_images
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.product_reviews
      WHERE product_reviews.id = review_images.review_id
        AND product_reviews.user_id = auth.uid()
    )
  );

-- Автор может создавать к своим отзывам
CREATE POLICY "review_images_author_insert" ON public.review_images
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.product_reviews
      WHERE product_reviews.id = review_images.review_id
        AND product_reviews.user_id = auth.uid()
    )
  );

-- Автор может удалять свои
CREATE POLICY "review_images_author_delete" ON public.review_images
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.product_reviews
      WHERE product_reviews.id = review_images.review_id
        AND product_reviews.user_id = auth.uid()
    )
  );

-- Админ full access
CREATE POLICY "review_images_admin_all" ON public.review_images
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ============================================================
-- 1c. Storage bucket review-images
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('review-images', 'review-images', true, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Storage policies
CREATE POLICY "review_images_storage_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'review-images');

CREATE POLICY "review_images_storage_auth_upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'review-images' AND auth.role() = 'authenticated');

CREATE POLICY "review_images_storage_auth_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'review-images' AND auth.role() = 'authenticated');

-- Перезагрузить схему PostgREST
NOTIFY pgrst, 'reload schema';
