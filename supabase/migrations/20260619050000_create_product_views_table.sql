-- Create product_views table for tracking user product views
-- Used in get_personalized_recommendations function

CREATE TABLE IF NOT EXISTS public.product_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, product_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_product_views_user_id ON public.product_views(user_id);
CREATE INDEX IF NOT EXISTS idx_product_views_product_id ON public.product_views(product_id);
CREATE INDEX IF NOT EXISTS idx_product_views_viewed_at ON public.product_views(viewed_at DESC);

-- RLS policies
ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- Users can view their own product views
CREATE POLICY "Users can view own product views"
    ON public.product_views
    FOR SELECT
    USING (auth.uid() = user_id);

-- Users can insert their own product views
CREATE POLICY "Users can insert own product views"
    ON public.product_views
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own product views (optional)
CREATE POLICY "Users can delete own product views"
    ON public.product_views
    FOR DELETE
    USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON public.product_views TO authenticated;
GRANT SELECT ON public.product_views TO service_role;

COMMENT ON TABLE public.product_views IS 'Tracks user product views for personalized recommendations';
