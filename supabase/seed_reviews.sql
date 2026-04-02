-- ============================================================================
-- СКРИПТ ДЛЯ ДОБАВЛЕНИЯ ТЕСТОВЫХ ОТЗЫВОВ И ОЦЕНОК
-- ============================================================================
-- Использование: psql -h localhost -p 54322 -U postgres -d postgres -f seed_reviews.sql
-- Или через Supabase Studio SQL Editor

-- Создаем тестовых пользователей (если их еще нет)
DO $$
DECLARE
  user_ids UUID[] := ARRAY[
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555'
  ];
  user_id UUID;
  counter INT := 1;
BEGIN
  FOREACH user_id IN ARRAY user_ids
  LOOP
    -- Создаем пользователя в auth.users
    INSERT INTO auth.users (
      id,
      instance_id,
      email,
      encrypted_password,
      email_confirmed_at,
      created_at,
      updated_at,
      raw_app_meta_data,
      raw_user_meta_data,
      aud,
      role
    ) VALUES (
      user_id,
      '00000000-0000-0000-0000-000000000000',
      'testuser' || counter || '@example.com',
      crypt('password123', gen_salt('bf')),
      NOW(),
      NOW(),
      NOW(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      ('{"full_name":"Тестовый Пользователь ' || counter || '"}')::jsonb,
      'authenticated',
      'authenticated'
    ) ON CONFLICT (id) DO NOTHING;

    -- Создаем профиль
    INSERT INTO public.profiles (
      id,
      first_name,
      last_name,
      phone,
      active_bonus_balance,
      pending_bonus_balance,
      has_received_welcome_bonus
    ) VALUES (
      user_id,
      'Имя' || counter,
      'Фамилия' || counter,
      '+7700' || LPAD(counter::TEXT, 7, '0'),
      0,
      0,
      false
    ) ON CONFLICT (id) DO NOTHING;

    counter := counter + 1;
  END LOOP;

  RAISE NOTICE '✅ Создано % тестовых пользователей', array_length(user_ids, 1);
END $$;

-- Удаляем старые тестовые отзывы (опционально)
-- DELETE FROM product_reviews WHERE user_id IN (
--   '11111111-1111-1111-1111-111111111111',
--   '22222222-2222-2222-2222-222222222222',
--   '33333333-3333-3333-3333-333333333333',
--   '44444444-4444-4444-4444-444444444444',
--   '55555555-5555-5555-5555-555555555555'
-- );

-- Добавляем отзывы для разных товаров
DO $$
DECLARE
  product_ids UUID[];
  product_id UUID;
  review_texts TEXT[] := ARRAY[
    'Отличный товар! Ребенок в восторге, играет каждый день.',
    'Качество на высоте, доставка быстрая. Рекомендую!',
    'Хорошая игрушка, но цена немного завышена.',
    'Супер! Именно то, что искали. Спасибо!',
    'Неплохо, но ожидал большего за такую цену.',
    'Прекрасное качество! Дочка очень довольна.',
    'Отличное соотношение цены и качества.',
    'Товар соответствует описанию. Всё хорошо.',
    'Замечательная игрушка! Сын не выпускает из рук.',
    'Хорошо, но есть небольшие недочеты в упаковке.',
    'Превосходно! Лучшая покупка за последнее время.',
    'Нормально, но можно было и лучше.',
    'Очень довольны покупкой! Качество отличное.',
    'Хорошая игрушка для своей цены.',
    'Ребенок счастлив, а это главное! Спасибо!'
  ];
  ratings INT[] := ARRAY[5, 5, 4, 5, 3, 5, 4, 4, 5, 3, 5, 3, 5, 4, 5];
  user_ids UUID[] := ARRAY[
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    '33333333-3333-3333-3333-333333333333',
    '44444444-4444-4444-4444-444444444444',
    '55555555-5555-5555-5555-555555555555'
  ];
  review_counter INT := 1;
  user_counter INT := 1;
BEGIN
  -- Получаем первые 5 активных товаров
  SELECT ARRAY(
    SELECT id FROM products WHERE is_active = true ORDER BY created_at LIMIT 5
  ) INTO product_ids;

  IF array_length(product_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Нет активных товаров в базе данных!';
  END IF;

  -- Добавляем по 3 отзыва для каждого товара
  FOREACH product_id IN ARRAY product_ids
  LOOP
    FOR i IN 1..3 LOOP
      BEGIN
        INSERT INTO public.product_reviews (
          id,
          user_id,
          product_id,
          rating,
          text,
          is_published,
          created_at,
          updated_at
        ) VALUES (
          gen_random_uuid(),
          user_ids[user_counter],
          product_id,
          ratings[review_counter],
          review_texts[review_counter],
          true,
          NOW() - (random() * INTERVAL '30 days'), -- Случайная дата за последние 30 дней
          NOW()
        );

        RAISE NOTICE '✅ Добавлен отзыв % для товара %', review_counter, product_id;

        review_counter := review_counter + 1;
        user_counter := (user_counter % 5) + 1; -- Циклически переключаем пользователей

        IF review_counter > array_length(review_texts, 1) THEN
          review_counter := 1;
        END IF;

      EXCEPTION
        WHEN unique_violation THEN
          RAISE NOTICE '⚠️  Отзыв от пользователя % для товара % уже существует', user_ids[user_counter], product_id;
      END;
    END LOOP;
  END LOOP;

  RAISE NOTICE '════════════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ ОТЗЫВЫ УСПЕШНО ДОБАВЛЕНЫ!';
  RAISE NOTICE '════════════════════════════════════════════════════════════════';
END $$;

-- Проверяем результаты
SELECT 
  p.name AS "Товар",
  p.avg_rating AS "Средний рейтинг",
  p.review_count AS "Количество отзывов",
  COUNT(pr.id) AS "Отзывов в таблице"
FROM products p
LEFT JOIN product_reviews pr ON pr.product_id = p.id AND pr.is_published = true
WHERE p.review_count > 0
GROUP BY p.id, p.name, p.avg_rating, p.review_count
ORDER BY p.review_count DESC;

-- Статистика по рейтингам
SELECT 
  '⭐ Общая статистика' AS "Категория",
  COUNT(DISTINCT product_id) AS "Товаров с отзывами",
  COUNT(*) AS "Всего отзывов",
  ROUND(AVG(rating)::numeric, 2) AS "Средний рейтинг"
FROM product_reviews
WHERE is_published = true;

-- Распределение оценок
SELECT 
  rating AS "Оценка",
  COUNT(*) AS "Количество",
  REPEAT('█', (COUNT(*)::float / (SELECT COUNT(*) FROM product_reviews WHERE is_published = true) * 50)::int) AS "График"
FROM product_reviews
WHERE is_published = true
GROUP BY rating
ORDER BY rating DESC;
