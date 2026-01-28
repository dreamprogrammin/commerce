CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'question_answered',
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notif_user_unread ON public.notifications(user_id) WHERE is_read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service insert" ON public.notifications FOR INSERT WITH CHECK (true);
