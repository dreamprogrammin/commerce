-- Миграция для настройки политики CORS для бакетов в Supabase Storage.
--
-- Проблема:
-- При использовании <NuxtImg> для оптимизации изображений, размещенных
-- на внешнем домене (Supabase Storage), браузеры могут блокировать
-- ответы из-за политики безопасности (OpaqueResponseBlocking, CORS).
--
-- Решение:
-- Мы явно указываем для каждого бакета список доверенных источников (origins),
-- которым разрешено запрашивать и обрабатывать изображения. Это позволяет
-- <NuxtImg> (работающему на домене Vercel) безопасно скачивать,
-- оптимизировать и отображать изображения из Supabase.

-- Обновляем CORS для бакета 'slides-images'
UPDATE
  storage.buckets
SET
  cors_configuration = '[
    {
      "allowedHeaders": ["authorization", "x-client-info", "apikey", "content-type"],
      "allowedMethods": ["GET"],
      "allowedOrigins": ["https://commerce-eta-wheat.vercel.app", "http://localhost:3000"],
      "maxAgeSeconds": 3000
    }
  ]'
WHERE
  id = 'slides-images';

-- Обновляем CORS для бакета 'product-images'
UPDATE
  storage.buckets
SET
  cors_configuration = '[
    {
      "allowedHeaders": ["authorization", "x-client-info", "apikey", "content-type"],
      "allowedMethods": ["GET"],
      "allowedOrigins": ["https://commerce-eta-wheat.vercel.app", "http://localhost:3000"],
      "maxAgeSeconds": 3000
    }
  ]'
WHERE
  id = 'product-images';

-- Обновляем CORS для бакета 'category-images'
UPDATE
  storage.buckets
SET
  cors_configuration = '[
    {
      "allowedHeaders": ["authorization", "x-client-info", "apikey", "content-type"],
      "allowedMethods": ["GET"],
      "allowedOrigins": ["https://commerce-eta-wheat.vercel.app", "http://localhost:3000"],
      "maxAgeSeconds": 3000
    }
  ]'
WHERE
  id = 'category-images';