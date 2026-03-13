# Brand Reviews Hub — Отчет о реализации

## Описание

Витрина отзывов бренда (Brand Reviews Hub) — блок, агрегирующий все отзывы на товары бренда. Размещается на страницах бренда (`/brand/[slug]`) и линейки (`/brand/[brandSlug]/[lineSlug]`).

Цели:
- **Social Proof** — повышение доверия покупателей
- **SEO** — звёзды рейтинга в результатах поиска Google через Schema.org `AggregateRating`

---

## Что реализовано

### 1. Бэкенд: RPC-функции (миграция `20260313000001_brand_reviews_rpc.sql`)

#### `get_reviews_by_brand(p_brand_id UUID, p_limit INT, p_offset INT)`

JOIN `product_reviews` + `products` + `profiles` + `review_images`.

Возвращает:
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | UUID | ID отзыва |
| `rating` | SMALLINT | Оценка 1-5 |
| `comment` | TEXT | Текст отзыва |
| `created_at` | TIMESTAMPTZ | Дата |
| `product_id` | UUID | ID товара |
| `product_name` | TEXT | Название товара |
| `product_slug` | TEXT | Slug товара (для ссылки) |
| `user_name` | TEXT | Имя автора из profiles |
| `user_avatar_url` | TEXT | Аватар автора |
| `images` | JSONB | Массив фото отзыва |

Фильтры:
- Только `is_published = true`
- Только товары с `brand_id = p_brand_id`
- Сортировка: `created_at DESC`
- Пагинация: `LIMIT` + `OFFSET`

#### `get_brand_stats(p_brand_id UUID)`

Агрегированная статистика бренда. Возвращает JSON:
```json
{
  "average_rating": 4.7,
  "total_reviews_count": 125
}
```

Логика: взвешенное среднее `SUM(avg_rating * review_count) / SUM(review_count)` по активным товарам бренда.

---

### 2. Frontend: Компонент `BrandReviewsList.vue`

**Расположение**: `components/brand/BrandReviewsList.vue`

**Props**:
- `brandId: string` — UUID бренда
- `brandName: string` — название бренда (для заголовка)

**Функциональность**:
- Заголовок с общим средним рейтингом (звезды) и кол-вом отзывов
- Карточки отзывов: аватар, имя, дата, звёзды, **ссылка на товар**, текст, фото
- Пагинация «Показать ещё» (по 5 отзывов)
- Lightbox для просмотра фотографий
- Скрывается если отзывов 0

**Интеграция**:
- Добавлен в `BrandStandardTemplate.vue` — после каталога, перед описанием бренда
- Добавлен в `BrandCustomTemplate.vue` — после каталога, перед SEO текстом
- Добавлен в `pages/brand/[brandSlug]/[lineSlug].vue` — после каталога, перед описанием линейки

---

### 3. SEO & Schema.org

#### Страница бренда (`/brand/[slug]`)

**Brand Schema** — теперь включает `aggregateRating`:
```json
{
  "@type": "Brand",
  "name": "LEGO",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": 4.8,
    "reviewCount": 125,
    "bestRating": 5,
    "worstRating": 1
  }
}
```

**CollectionPage Schema** — также обновлен с `aggregateRating`.

Если `total_reviews_count === 0`, блок `aggregateRating` не выводится (избежание ошибок Google).

#### Страница линейки (`/brand/[brandSlug]/[lineSlug]`)

**Brand Schema** для линейки — добавлен `aggregateRating` из `get_brand_stats`.

---

## Измененные файлы

| Файл | Изменение |
|------|-----------|
| `supabase/migrations/20260313000001_brand_reviews_rpc.sql` | **Новый** — RPC `get_reviews_by_brand` + `get_brand_stats` |
| `components/brand/BrandReviewsList.vue` | **Новый** — компонент витрины отзывов |
| `components/brand/BrandStandardTemplate.vue` | Добавлен `BrandReviewsList` |
| `components/brand/BrandCustomTemplate.vue` | Добавлен `BrandReviewsList` |
| `pages/brand/[slug].vue` | Заменен `get_brand_aggregate_rating` на `get_brand_stats`, обновлен Brand Schema |
| `pages/brand/[brandSlug]/[lineSlug].vue` | Добавлен `get_brand_stats`, `aggregateRating` в Schema, `BrandReviewsList` |

---

## Деплой

1. Применить миграцию:
   ```bash
   supabase db reset   # локально
   # или
   supabase db push    # продакшен
   ```

2. Проверить работу RPC:
   ```sql
   SELECT * FROM get_reviews_by_brand('brand-uuid-here', 5, 0);
   SELECT get_brand_stats('brand-uuid-here');
   ```

3. Проверить Schema.org через [Google Rich Results Test](https://search.google.com/test/rich-results).
