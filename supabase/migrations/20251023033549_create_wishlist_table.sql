-- Up Migration: Создание таблицы для избранных товаров (Wishlist)

CREATE TABLE public.wishlist (
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    -- PRIMARY KEY (user_id, product_id) гарантирует, что пользователь может добавить товар только один раз
    PRIMARY KEY (user_id, product_id)
);

-- Включаем защиту на уровне строк
ALTER TABLE public.wishlist ENABLE ROW LEVEL SECURITY;

-- Политика: Пользователь может видеть только свои избранные товары
CREATE POLICY "User can view own wishlist"
ON public.wishlist
FOR SELECT
USING (auth.uid() = user_id);

-- Политика: Пользователь может добавлять и удалять только свои товары
CREATE POLICY "User can manage own wishlist"
ON public.wishlist
FOR ALL
USING (auth.uid() = user_id);


/*
-- Down Migration (в комментарии)

DROP TABLE public.wishlist;

*/