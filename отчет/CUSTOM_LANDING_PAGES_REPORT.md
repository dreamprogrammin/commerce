# Отчёт: Кастомные Landing Pages для VIP-брендов

## Дата: 08.03.2026

## Описание задачи

Реализована система создания кастомных посадочных страниц для топовых брендов (например, LEGO). Администратор может включить для бренда кастомный макет с hero-баннером, избранными линейками продуктов и SEO-текстом. На витрине отображается либо стандартный, либо кастомный шаблон в зависимости от флага `is_custom_page`.

---

## Реализованные изменения

### 1. Миграция базы данных

**Файл:** `supabase/migrations/20260308000001_add_custom_brand_pages.sql`

- Добавлен столбец `is_custom_page` (BOOLEAN, DEFAULT false) в таблицу `brands`
- Добавлен столбец `page_layout` (JSONB, DEFAULT NULL) для хранения конфигурации кастомной страницы
- Создана RPC-функция `get_brand_aggregate_rating(p_brand_id UUID)` — возвращает взвешенный средний рейтинг и общее количество отзывов всех активных товаров бренда (по аналогии с `get_category_aggregate_rating`)

### 2. TypeScript типы

**Файл:** `types/type.ts`

Добавлен интерфейс `BrandPageLayout`:

```typescript
interface BrandPageLayout {
  heroBanner: string | null       // базовый путь в bucket banners
  heroBannerBlur: string | null   // base64 LQIP placeholder
  featuredLineIds: string[]       // UUID избранных линеек
}
```

### 3. Admin Store

**Файл:** `stores/adminStore/adminBrandsStore.ts`

- Добавлен метод `_uploadBannerVariants(file, seoName)` — загружает 3 варианта wide-изображения (sm/md/lg) в bucket `banners`, по паттерну из `useBannerForm.ts`
- Обновлен `createBrand()` — принимает опциональный `bannerFile`, при `is_custom_page` загружает баннер и сохраняет путь в `page_layout`
- Обновлен `updateBrand()` — аналогично, с удалением старого баннера через `getVariantPathsWide()`

### 4. Админ-форма бренда

**Файл:** `components/admin/brands/BrandForm.vue`

Добавлена секция "Кастомная Landing Page" после SEO-раздела:

- Toggle-переключатель `is_custom_page`
- При включении отображаются:
  - Загрузка hero-баннера (рекомендуемый размер 1920x600) с превью
  - Чекбоксы для выбора избранных линеек бренда (загружаются из `product_lines`)
  - Поля SEO Title, H1, SEO текст (HTML)
- Emit обновлён для передачи `bannerFile`

**Файлы также обновлены:**
- `pages/admin/brands/[id].vue` — передача `bannerFile` в `updateBrand()`
- `pages/admin/brands/new.vue` — передача `bannerFile` в `createBrand()`

### 5. Frontend компоненты

#### 5a. BrandStandardTemplate.vue (новый)

**Файл:** `components/brand/BrandStandardTemplate.vue`

Извлечён стандартный шаблон страницы бренда из `pages/brand/[slug].vue`:
- Hero-секция с градиентом и логотипом
- Статистика (количество товаров, гарантия оригинала)
- Сетка линеек (`BrandProductLinesGrid`)
- Каталог товаров с сортировкой
- Сворачиваемое описание бренда с SEO-ключевыми словами

#### 5b. BrandCustomTemplate.vue (новый)

**Файл:** `components/brand/BrandCustomTemplate.vue`

Кастомный шаблон для VIP-брендов:
- Полноширинный hero-баннер с `<picture>` (sm/md/lg варианты) и LQIP blur placeholder
- Overlay с логотипом бренда и H1 поверх баннера
- Секция избранных линеек — крупные карточки (1-3 колонки) с описаниями
- Остальные линейки через стандартный `BrandProductLinesGrid`
- Каталог товаров с сортировкой
- SEO текст (v-html с prose-стилями из `BrandDescription`)

#### 5c. Рефакторинг страницы бренда

**Файл:** `pages/brand/[slug].vue`

- Добавлена загрузка агрегированного рейтинга через `get_brand_aggregate_rating` RPC
- Вычисляемые свойства `isCustomPage`, `pageLayout`, `featuredProductLines`
- Шаблон: loading → not found → `BrandCustomTemplate` (если `is_custom_page`) → `BrandStandardTemplate`

### 6. SEO и Schema.org

**Файл:** `pages/brand/[slug].vue`

- Добавлен блок `aggregateRating` в CollectionPage Schema при `total_reviews > 0`:
  ```json
  {
    "@type": "AggregateRating",
    "ratingValue": 4.5,
    "reviewCount": 120,
    "bestRating": 5,
    "worstRating": 1
  }
  ```
- Существующие SEO мета-теги (title, description, keywords) работают без изменений

---

## Структура page_layout (JSONB)

```json
{
  "heroBanner": "brand-banner-lego_1709884800",
  "heroBannerBlur": "data:image/webp;base64,...",
  "featuredLineIds": [
    "uuid-1-star-wars",
    "uuid-2-technic",
    "uuid-3-city"
  ]
}
```

---

## Файлы

| Действие | Файл |
|----------|------|
| СОЗДАН | `supabase/migrations/20260308000001_add_custom_brand_pages.sql` |
| ИЗМЕНЁН | `types/type.ts` |
| ИЗМЕНЁН | `stores/adminStore/adminBrandsStore.ts` |
| ИЗМЕНЁН | `components/admin/brands/BrandForm.vue` |
| ИЗМЕНЁН | `pages/admin/brands/[id].vue` |
| ИЗМЕНЁН | `pages/admin/brands/new.vue` |
| СОЗДАН | `components/brand/BrandStandardTemplate.vue` |
| СОЗДАН | `components/brand/BrandCustomTemplate.vue` |
| ИЗМЕНЁН | `pages/brand/[slug].vue` |

---

## Инструкция по верификации

1. Применить миграцию: `supabase db reset`
2. Перегенерировать типы: `supabase gen types typescript --local > types/supabase.ts`
3. Запустить dev-сервер: `pnpm dev`
4. В админке: редактировать бренд → включить "Кастомная Landing Page" → загрузить баннер → выбрать избранные линейки → заполнить SEO поля
5. На витрине: `/brand/{slug}` → проверить кастомный шаблон с баннером и избранными линейками
6. Посмотреть исходный код страницы → проверить JSON-LD с `aggregateRating`
7. Проверить код: `pnpm lint`
