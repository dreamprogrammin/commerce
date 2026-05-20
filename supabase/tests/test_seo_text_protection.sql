-- Тест защиты уникальных SEO-текстов
-- Запустить в Supabase SQL Editor

-- 1. Создаём тестовую запись с коротким текстом (шаблонным)
DO $$
DECLARE
  v_test_category_id UUID;
  v_test_brand_id UUID;
  v_result JSONB;
BEGIN
  -- Получаем первую категорию и бренд для теста
  SELECT id INTO v_test_category_id FROM categories LIMIT 1;
  SELECT id INTO v_test_brand_id FROM brands LIMIT 1;

  RAISE NOTICE 'Тест 1: Создание записи с коротким текстом';
  
  -- Создаём запись с коротким текстом
  INSERT INTO category_brand_seo (category_id, brand_id, seo_h1, seo_title, seo_description, seo_text)
  VALUES (
    v_test_category_id,
    v_test_brand_id,
    'Test H1',
    'Test Title',
    'Test Description',
    'Короткий шаблонный текст'
  )
  ON CONFLICT (category_id, brand_id) DO UPDATE
  SET seo_text = 'Короткий шаблонный текст';

  RAISE NOTICE '✓ Запись создана';

  -- Пытаемся обновить через safe_upsert
  RAISE NOTICE 'Тест 2: Обновление короткого текста (должно пройти)';
  
  SELECT safe_upsert_category_brand_seo(
    v_test_category_id,
    v_test_brand_id,
    'Updated H1',
    'Updated Title',
    'Updated Description',
    'Новый сгенерированный текст'
  ) INTO v_result;

  RAISE NOTICE 'Результат: %', v_result;
  
  IF v_result->>'protected' = 'false' THEN
    RAISE NOTICE '✓ Короткий текст успешно обновлён';
  ELSE
    RAISE EXCEPTION '✗ ОШИБКА: Короткий текст не должен быть защищён';
  END IF;

  -- Обновляем на длинный уникальный текст
  RAISE NOTICE 'Тест 3: Создание уникального текста (длинный HTML)';
  
  UPDATE category_brand_seo
  SET seo_text = '<h2>Уникальный заголовок</h2><p>Это очень длинный уникальный текст, который написал контент-менеджер. Он содержит более 300 символов и HTML-теги. Этот текст должен быть защищён от перезаписи автогенерацией. Мы добавляем ещё больше текста, чтобы точно превысить лимит в 300 символов. Это важный SEO-текст для продвижения бренда.</p>'
  WHERE category_id = v_test_category_id AND brand_id = v_test_brand_id;

  RAISE NOTICE '✓ Уникальный текст создан';

  -- Пытаемся обновить уникальный текст через safe_upsert
  RAISE NOTICE 'Тест 4: Попытка обновить уникальный текст (должно быть заблокировано)';
  
  SELECT safe_upsert_category_brand_seo(
    v_test_category_id,
    v_test_brand_id,
    'Another H1',
    'Another Title',
    'Another Description',
    'Попытка перезаписать уникальный текст'
  ) INTO v_result;

  RAISE NOTICE 'Результат: %', v_result;
  
  IF v_result->>'protected' = 'true' THEN
    RAISE NOTICE '✓ Уникальный текст защищён от перезаписи';
  ELSE
    RAISE EXCEPTION '✗ ОШИБКА: Уникальный текст должен быть защищён';
  END IF;

  -- Проверяем, что seo_text не изменился
  DECLARE
    v_current_text TEXT;
  BEGIN
    SELECT seo_text INTO v_current_text
    FROM category_brand_seo
    WHERE category_id = v_test_category_id AND brand_id = v_test_brand_id;

    IF v_current_text LIKE '%Уникальный заголовок%' THEN
      RAISE NOTICE '✓ SEO-текст остался без изменений';
    ELSE
      RAISE EXCEPTION '✗ ОШИБКА: SEO-текст был перезаписан!';
    END IF;
  END;

  -- Проверяем, что другие поля обновились
  DECLARE
    v_current_h1 TEXT;
  BEGIN
    SELECT seo_h1 INTO v_current_h1
    FROM category_brand_seo
    WHERE category_id = v_test_category_id AND brand_id = v_test_brand_id;

    IF v_current_h1 = 'Another H1' THEN
      RAISE NOTICE '✓ Другие поля (seo_h1) обновились корректно';
    ELSE
      RAISE EXCEPTION '✗ ОШИБКА: Другие поля не обновились';
    END IF;
  END;

  -- Очистка тестовых данных
  DELETE FROM category_brand_seo
  WHERE category_id = v_test_category_id AND brand_id = v_test_brand_id;

  RAISE NOTICE '✓ Тестовые данные удалены';
  RAISE NOTICE '';
  RAISE NOTICE '=== ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО ===';
END $$;
