-- RPC функция для безопасного upsert SEO-текстов категория+бренд
-- НЕ перезаписывает уникальные тексты (длиннее 300 символов или содержащие HTML-теги)
CREATE OR REPLACE FUNCTION safe_upsert_category_brand_seo(
  p_category_id UUID,
  p_brand_id UUID,
  p_seo_h1 TEXT,
  p_seo_title TEXT,
  p_seo_description TEXT,
  p_seo_text TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_text TEXT;
  v_is_unique_content BOOLEAN := false;
  v_result JSONB;
BEGIN
  -- Проверяем, есть ли уже запись
  SELECT seo_text INTO v_existing_text
  FROM category_brand_seo
  WHERE category_id = p_category_id AND brand_id = p_brand_id;

  -- Если запись существует, проверяем, является ли текст уникальным
  IF v_existing_text IS NOT NULL THEN
    -- Считаем текст уникальным, если:
    -- 1. Длина > 300 символов ИЛИ
    -- 2. Содержит HTML-теги (кроме простых <p>, <br>)
    v_is_unique_content := (
      LENGTH(v_existing_text) > 300 OR
      v_existing_text ~ '<h[1-6]|<div|<section|<article|<ul|<ol|<li|<strong|<em|<a '
    );
  END IF;

  -- Если текст уникальный, НЕ перезаписываем seo_text
  IF v_is_unique_content THEN
    UPDATE category_brand_seo
    SET
      seo_h1 = COALESCE(p_seo_h1, seo_h1),
      seo_title = COALESCE(p_seo_title, seo_title),
      seo_description = COALESCE(p_seo_description, seo_description),
      -- seo_text НЕ обновляем!
      updated_at = NOW()
    WHERE category_id = p_category_id AND brand_id = p_brand_id;

    v_result := jsonb_build_object(
      'action', 'updated_partial',
      'message', 'SEO-текст не обновлён (защищён от перезаписи)',
      'protected', true
    );
  ELSE
    -- Если текста нет или он шаблонный, делаем полный upsert
    INSERT INTO category_brand_seo (
      category_id,
      brand_id,
      seo_h1,
      seo_title,
      seo_description,
      seo_text
    )
    VALUES (
      p_category_id,
      p_brand_id,
      p_seo_h1,
      p_seo_title,
      p_seo_description,
      p_seo_text
    )
    ON CONFLICT (category_id, brand_id)
    DO UPDATE SET
      seo_h1 = EXCLUDED.seo_h1,
      seo_title = EXCLUDED.seo_title,
      seo_description = EXCLUDED.seo_description,
      seo_text = EXCLUDED.seo_text,
      updated_at = NOW();

    v_result := jsonb_build_object(
      'action', CASE WHEN v_existing_text IS NULL THEN 'inserted' ELSE 'updated_full' END,
      'message', 'SEO-текст успешно обновлён',
      'protected', false
    );
  END IF;

  RETURN v_result;
END;
$$;
