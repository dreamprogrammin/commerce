# Система отзывов — PGRST200 fix + Фото + Кнопка в заказе

## Проблемы

### 1. PGRST200 — FK через auth.users
**Симптом**: PostgREST не может JOIN `product_reviews.user_id` → `profiles` через `auth.users` (другая схема).

**Решение**: Добавлен второй FK `product_reviews_profile_id_fkey` напрямую к `public.profiles(id)`. Оригинальный FK к `auth.users` сохранён для cascade delete.

**Hint в коде**: `profiles!product_reviews_profile_id_fkey` (вместо `profiles!product_reviews_user_id_fkey`).

### 2. Нет фото в отзывах
**Решение**:
- Таблица `review_images` (id, review_id, image_url, blur_placeholder, display_order)
- Storage bucket `review-images` (public, 5MB limit, jpeg/png/webp)
- RLS: публичное чтение опубликованных, авторское CRUD, админ full access

### 3. Нет кнопки "Оставить отзыв" в заказе
**Решение**: На странице `/profile/order/[id]` для `delivered`/`completed` заказов — кнопка у каждого товара → `ReviewFormDialog`.

## Миграция

```
supabase/migrations/20260228000001_review_images_and_fk_fix.sql
```

После применения:
```bash
supabase gen types typescript --local > types/supabase.ts
```

## Изменённые файлы

| Файл | Что изменено |
|------|-------------|
| `constants/index.ts` | `BUCKET_NAME_REVIEWS` |
| `config/images.ts` | `REVIEW_THUMB`, `REVIEW_FULL` presets |
| `stores/publicStore/reviewsStore.ts` | FK hint fix, `review_images` в select, загрузка/удаление фото |
| `stores/adminStore/adminReviewsStore.ts` | FK hint fix, `review_images` в select, удаление фото из storage |
| `components/product/ReviewCard.vue` | Сетка миниатюр + lightbox dialog |
| `components/product/ProductReviews.vue` | File input + preview + оптимизация в форме |
| `components/product/ReviewFormDialog.vue` | **NEW** — Dialog для отзыва со страницы заказа |
| `pages/profile/order/[id].vue` | Кнопка "Оставить отзыв" / Badge "Отзыв оставлен" |
| `pages/admin/reviews.vue` | Миниатюры фото в модерации |
| `types/supabase.ts` | `review_images` table type + новый FK relationship |

## Логика загрузки фото

1. Пользователь выбирает до 5 фото (jpeg/png/webp)
2. Каждое фото проходит через `optimizeImageBeforeUpload()` (WebP, ≤150KB) + LQIP blur
3. После создания отзыва → upload в `review-images/reviews/{reviewId}/{index}_{timestamp}.ext`
4. INSERT в `review_images` с путём и blur placeholder
5. При удалении отзыва → каскадное удаление записей + удаление файлов из storage

## Верификация

1. Страница товара — отзывы загружаются без PGRST200
2. Отзыв с фото — оптимизация + LQIP + отображение миниатюр + lightbox
3. Admin `/admin/reviews` — фото видны в модерации
4. Страница заказа (delivered) — кнопка "Оставить отзыв" → форма → "Отзыв оставлен"
5. Удаление отзыва — файлы удаляются из storage
