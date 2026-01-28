-- Обновляем триггер - убираем email уведомления, оставляем только in-app
CREATE OR REPLACE FUNCTION public.notify_question_answered()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product_name TEXT;
  v_product_slug TEXT;
BEGIN
  -- Срабатывает только когда добавляется новый ответ
  IF OLD.answer_text IS NOT NULL OR NEW.answer_text IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name, slug INTO v_product_name, v_product_slug
  FROM public.products WHERE id = NEW.product_id;

  -- Вызываем Edge Function для создания in-app уведомления
  PERFORM net.http_post(
    url := 'https://gvsdevsvzgcivpphcuai.supabase.co/functions/v1/notify-question-answered',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'question_id', NEW.id,
      'product_name', v_product_name,
      'product_slug', v_product_slug
    )
  );

  RETURN NEW;
END;
$$;
