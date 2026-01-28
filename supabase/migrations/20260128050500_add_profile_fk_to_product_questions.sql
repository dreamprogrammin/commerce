-- Add FK from product_questions.user_id to profiles.id for PostgREST join support
ALTER TABLE public.product_questions
  ADD CONSTRAINT product_questions_profile_fk
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
