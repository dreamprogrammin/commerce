-- =====================================================================================
-- МИГРАЦИЯ: Система отзывов с бонусами
-- =====================================================================================
-- product_reviews: таблица отзывов (UNIQUE per user+product)
-- Триггер update_product_review_stats: пересчитывает avg_rating + review_count
-- Триггер request_review_on_delivery: уведомление при доставке
-- Триггер award_bonus_for_review: 500 бонусов за публикацию отзыва
-- =====================================================================================

-- 1. Колонки avg_rating и review_count в products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS avg_rating NUMERIC(2,1) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS review_count INTEGER DEFAULT 0;

-- 2. Таблица product_reviews
CREATE TABLE public.product_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Индексы
CREATE INDEX idx_reviews_product ON public.product_reviews(product_id) WHERE is_published = true;
CREATE INDEX idx_reviews_user ON public.product_reviews(user_id);
CREATE INDEX idx_reviews_unpublished ON public.product_reviews(created_at DESC) WHERE is_published = false;

-- RLS: публичное чтение опубликованных
CREATE POLICY "Anyone can read published reviews"
  ON public.product_reviews FOR SELECT
  USING (is_published = true);

-- RLS: пользователь видит свои (даже неопубликованные)
CREATE POLICY "Users read own reviews"
  ON public.product_reviews FOR SELECT
  USING (auth.uid() = user_id);

-- RLS: пользователь создаёт свои
CREATE POLICY "Users create own reviews"
  ON public.product_reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- RLS: пользователь обновляет свои неопубликованные
CREATE POLICY "Users update own unpublished reviews"
  ON public.product_reviews FOR UPDATE
  USING (auth.uid() = user_id AND is_published = false)
  WITH CHECK (auth.uid() = user_id);

-- RLS: пользователь удаляет свои
CREATE POLICY "Users delete own reviews"
  ON public.product_reviews FOR DELETE
  USING (auth.uid() = user_id);

-- RLS: админ — полный доступ
CREATE POLICY "Admins manage all reviews"
  ON public.product_reviews FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Триггер: пересчёт avg_rating + review_count при изменениях
CREATE OR REPLACE FUNCTION public.update_product_review_stats()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_id UUID;
BEGIN
  -- Определяем product_id (может быть OLD или NEW)
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);

  UPDATE public.products SET
    avg_rating = COALESCE(
      (SELECT ROUND(AVG(rating)::numeric, 1)
       FROM public.product_reviews
       WHERE product_id = v_product_id AND is_published = true),
      0
    ),
    review_count = (
      SELECT COUNT(*)
      FROM public.product_reviews
      WHERE product_id = v_product_id AND is_published = true
    )
  WHERE id = v_product_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trigger_update_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON public.product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_product_review_stats();

-- 4. Триггер: запрос отзыва при доставке
CREATE OR REPLACE FUNCTION public.request_review_on_delivery()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product RECORD;
  v_slug TEXT;
BEGIN
  -- Только при смене статуса на 'delivered'
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  -- Только для авторизованных заказов
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Берём первый товар из заказа для ссылки
  SELECT p.slug INTO v_slug
  FROM public.order_items oi
  JOIN public.products p ON p.id = oi.product_id
  WHERE oi.order_id = NEW.id
  LIMIT 1;

  -- Уведомление (автоматически уйдёт в Telegram через trigger_telegram_on_notification)
  INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
  VALUES (
    NEW.user_id,
    'review_request',
    '⭐ Оставьте отзыв и получите 500 бонусов!',
    'Поделитесь впечатлениями о покупке — это поможет другим покупателям.',
    '/catalog/products/' || COALESCE(v_slug, '') || '#reviews',
    false
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'request_review_on_delivery error: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_request_review_on_delivery
  AFTER UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.request_review_on_delivery();

-- 5. Триггер: бонус за опубликованный отзыв
CREATE OR REPLACE FUNCTION public.award_bonus_for_review()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Только при публикации (is_published: false → true)
  IF NEW.is_published = true AND (OLD.is_published = false OR OLD.is_published IS NULL) THEN
    -- Проверяем, не давали ли уже бонус за этот отзыв
    IF EXISTS (
      SELECT 1 FROM public.bonus_transactions
      WHERE user_id = NEW.user_id
        AND transaction_type = 'review'
        AND description LIKE '%' || NEW.id::text || '%'
    ) THEN
      RETURN NEW;
    END IF;

    -- Начисляем 500 pending бонусов
    INSERT INTO public.bonus_transactions (
      user_id, transaction_type, amount, description, created_at
    ) VALUES (
      NEW.user_id, 'review', 500,
      'Бонусы за отзыв (review: ' || NEW.id || ')',
      now()
    );

    -- Увеличиваем pending_bonus_balance
    UPDATE public.profiles
    SET pending_bonus_balance = COALESCE(pending_bonus_balance, 0) + 500
    WHERE id = NEW.user_id;

    -- Уведомление о начислении
    INSERT INTO public.notifications (user_id, type, title, body, link, is_read)
    VALUES (
      NEW.user_id,
      'bonus_earned',
      '🎁 Вам начислено 500 бонусов!',
      'Спасибо за отзыв! Бонусы станут доступны через 14 дней.',
      '/profile/bonuses',
      false
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'award_bonus_for_review error: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_award_bonus_for_review
  AFTER UPDATE ON public.product_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.award_bonus_for_review();

-- 6. Добавляем 'review' в допустимые типы bonus_transactions
-- (ALTER CHECK constraint)
ALTER TABLE public.bonus_transactions
  DROP CONSTRAINT IF EXISTS bonus_transactions_transaction_type_check;

ALTER TABLE public.bonus_transactions
  ADD CONSTRAINT bonus_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'earned', 'spent', 'welcome', 'refund_spent', 'refund_earned', 'activation', 'review'
  ));
