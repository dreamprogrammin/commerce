# Архитектура страницы товара

## Обзор

Страница `/catalog/products/[slug].vue` — детальная карточка товара с полной SEO-оптимизацией, Schema.org разметкой, SSR-рендерингом и адаптивным UI.

---

## Структура данных

### SSR-загрузка (серверная)
```typescript
if (import.meta.server) {
  // Параллельная загрузка:
  // 1. Категории (если не загружены)
  // 2. Продукт по slug
  // 3. Отзывы для Schema.org
  
  // Предзаполнение queryClient для гидратации
}
```

### Клиентские запросы (Vue Query)
- **product** — основной товар (staleTime: 2 мин)
- **accessories** — аксессуары (батарейки, упаковка)
- **similarProducts** — похожие товары из категории
- **productReviews** — отзывы покупателей
- **productQuestions** — вопросы-ответы (useAsyncData)

---

## Computed-свойства

### Цены и скидки
```typescript
mainProductPrice // final_price из БД (с психологическим округлением)
totalPrice       // основной товар + выбранные аксессуары
totalBonuses     // бонусные баллы за комплект
```

### SEO-метаданные
```typescript
metaTitle        // Приоритет: meta_title → seo_title → автогенерация
metaDescription  // Приоритет: meta_description → seo_description → автогенерация
metaKeywords     // Автогенерация из атрибутов товара
audienceText     // "для девочек от 3 до 5 лет"
```

### Навигация
```typescript
breadcrumbs      // Хлебные крошки из категорий + товар
brandLink        // /brand/{slug}
productLineLink  // /brand/{brand_slug}/{line_slug}
categoryLink     // /catalog/{slug}
```

---

## SEO-оптимизация

### Meta-теги (useSeoMeta)
- title, description
- Open Graph (og:image, og:title, og:description)
- Twitter Card
- robots (noindex только для is_active=false)

### Schema.org разметка
1. **Product** (useSchemaOrg + defineProduct)
   - sku, mpn, gtin (штрихкод)
   - brand (с поддержкой product_line как parentOrganization)
   - offers (цена, availability, priceSpecification для скидок)
   - aggregateRating, review (топ-5)
   - isAccessoryOrSparePartFor (связь с аксессуарами)
   - isSimilarTo (связь с похожими товарами)

2. **BreadcrumbList** (useBreadcrumbSchema)

3. **FAQPage** (watchEffect)
   - Генерируется из productQuestions с очисткой HTML

### Robots-правила
```typescript
// noindex ТОЛЬКО если is_active === false
// Товары без остатка (stock_quantity === 0) индексируются
```

---

## UI-компоненты

### Десктоп (lg+)
```
┌─────────────────┬──────────────┐
│   Галерея (7)   │  Sticky (5)  │
│                 │  - Цена      │
│                 │  - Корзина   │
│                 │  - Аксессуары│
├─────────────────┴──────────────┤
│  О товаре (характеристики)     │
├────────────────────────────────┤
│  Ещё товары (бренд, категория) │
├────────────────────────────────┤
│  Отзывы                        │
├────────────────────────────────┤
│  Вопросы-ответы                │
└────────────────────────────────┘
```

### Мобильный
- Sticky-панель внизу экрана (glass-эффект)
- Анимация при скролле (поднимается над навбаром)
- Flip-counter для цены

---

## Ключевые фичи

### 1. Flip Counter (анимация цены)
```typescript
useFlipCounter(totalPrice, digitColumns)
// Плавная анимация смены цифр при выборе аксессуаров
```

### 2. Аксессуары
- Автовыбор товаров, уже добавленных в корзину
- Пересчет итоговой цены и бонусов
- Плашка-расшифровка комплекта

### 3. Sticky-панель (мобильный)
```css
.sticky-above-nav { transform: translateY(-68px); }
.sticky-at-bottom { transform: translateY(0); }
```

### 4. Prefetch похожих товаров
```typescript
@mouseenter-product="prefetchProduct"
// Предзагрузка при наведении на карточку
```

---

## Интеграция с Store

### Используемые Store
- **productsStore** — fetchProductBySlug, fetchSimilarProducts
- **cartStore** — addItem, items (проверка наличия в корзине)
- **categoriesStore** — getBreadcrumbs, allCategories
- **reviewsStore** — fetchReviews
- **questionsStore** — fetchQuestions

---

## Производительность

### Кэширование (Vue Query)
```typescript
product:          staleTime: 2 мин,  gcTime: 10 мин
accessories:      staleTime: 10 мин, gcTime: 30 мин
similarProducts:  staleTime: 15 мин, gcTime: 30 мин
reviews:          staleTime: 5 мин,  gcTime: 10 мин
```

### SSR-оптимизация
- Параллельная загрузка данных
- Предзаполнение queryClient
- Гидратация без повторных запросов

---

## Обработка ошибок

```typescript
// 404 если товар не найден (SSR + клиент)
if (!initialProduct && !ssrFetchFailed) {
  throw createError({ statusCode: 404, fatal: true })
}

// Fallback на скелетон при загрузке
<ClientOnly>
  <ProductDetailSkeleton v-if="isLoading" />
</ClientOnly>
```

---

## Связанные компоненты

- `ProductGallery` — галерея изображений
- `ProductDescription` — описание с раскрытием
- `AccessoriesBlock` — выбор аксессуаров
- `ProductReviews` — отзывы с рейтингом
- `ProductQuestions` — FAQ-секция
- `ProductCarousel` — похожие товары
- `QuantitySelector` — изменение количества в корзине
- `StockAlertButton` — уведомление о поступлении

---

## SEO-тикеты (реализованные)

1. **Deep Crawling** — связывание через isAccessoryOrSparePartFor, isSimilarTo
2. **Индексация без остатка** — убран noindex при stock_quantity === 0
3. **SEO-хвост в H1** — "Игрушка для девочек от 3 лет от LEGO"
4. **Скидки в Schema.org** — priceSpecification с SalePrice

---

## Будущие улучшения

- [ ] Добавить SEOContentRenderer для product.seo_content
- [ ] Lazy-load похожих товаров (Intersection Observer)
- [ ] Кэширование изображений в Service Worker
- [ ] A/B тестирование расположения кнопки "Купить"
