# Архитектура страниц брендов

## Обзор

Страницы `/brand/[slug].vue` и `/brand/[brandSlug]/[lineSlug].vue` — каталоги товаров бренда/линейки с полной SEO-оптимизацией, Schema.org разметкой, фильтрацией и адаптивным UI.

---

## Структура данных

### SSR-загрузка (серверная)

**Страница бренда:**
```typescript
// 1. Загрузка бренда из store или БД
const { data: brand } = await useAsyncData(`brand-${brandSlug}`, async () => {
  let foundBrand = productsStore.brands.find(b => b.slug === brandSlug)
  if (!foundBrand && productsStore.brands.length === 0) {
    await productsStore.fetchAllBrands()
    foundBrand = productsStore.brands.find(b => b.slug === brandSlug)
  }
  return foundBrand || null
})

// 2. Загрузка линеек бренда (client-side)
async function loadProductLines() {
  const { data } = await supabase
    .from('product_lines')
    .eq('brand_id', brand.value.id)
    .order('name', { ascending: true })
  brandProductLines.value = data
}

// 3. Агрегированная статистика (RPC)
async function loadBrandStats() {
  const { data } = await supabase.rpc('get_brand_stats', {
    p_brand_id: brand.value.id
  })
  brandStats.value = data // { average_rating, total_reviews_count }
}
```

**Страница линейки:**
```typescript
// 1. Загрузка бренда
const { data: brand } = await useAsyncData(`brand-${brandSlug}`, ...)

// 2. Загрузка линейки
const { data: productLine } = await useAsyncData(
  `product-line-${brandSlug}-${lineSlug}`,
  async () => {
    const { data } = await supabase
      .from('product_lines')
      .eq('brand_id', brand.value.id)
      .eq('slug', lineSlug)
      .single()
    return data
  }
)
```

### Клиентские запросы (useBrandPageFilters)

```typescript
const filterState = useBrandPageFilters({
  brandId: computed(() => brand.value?.id),
  context: 'brand', // или 'line'
  brandProductLines,
})

// Методы:
filterState.loadProducts()      // Загрузка товаров с фильтрами
filterState.loadFilterData()    // Загрузка опций фильтров
filterState.toggleCategory(id)  // Переключение категории
filterState.toggleAttribute()   // Переключение атрибута
filterState.clearFilters()      // Сброс фильтров
```

---

## Computed-свойства

### Навигация
```typescript
breadcrumbs      // Хлебные крошки: Бренды → LEGO → City
brandUrl         // https://uhti.kz/brand/lego
pageUrl          // https://uhti.kz/brand/lego/city
```

### SEO-метаданные
```typescript
metaTitle        // Приоритет: meta_title → seo_title → автогенерация
metaDescription  // Приоритет: meta_description → seo_description → description
metaKeywords     // meta_keywords → seo_keywords → автогенерация
seoBlocks        // Парсинг seo_content через parseHTMLToBlocks
seoContentText   // Извлечение текста для Schema.org (макс 300 символов)
```

### Шаблоны
```typescript
isCustomPage     // Флаг кастомного шаблона (brand.is_custom_page)
pageLayout       // Конфигурация кастомного шаблона (brand.page_layout)
featuredProductLines // Избранные линейки для кастомного шаблона
```

---

## SEO-оптимизация

### Meta-теги (useSeoMeta)
- title, description, keywords
- Open Graph (og:image, og:title, og:description)
- Twitter Card
- robots: "index, follow"

### Schema.org разметка

#### 1. Brand Schema
```json
{
  "@context": "https://schema.org",
  "@type": "Brand",
  "@id": "https://uhti.kz/brand/lego#brand",
  "name": "LEGO",
  "description": "Текст из seo_content или metaDescription",
  "url": "https://uhti.kz/brand/lego",
  "logo": "https://...",
  "keywords": "LEGO, конструкторы, игрушки",
  "subOrganization": [
    {
      "@type": "Brand",
      "@id": "https://uhti.kz/brand/lego/city#brand",
      "name": "LEGO City",
      "url": "https://uhti.kz/brand/lego/city"
    }
  ]
}
```

**Для линейки:**
```json
{
  "@type": "Brand",
  "name": "LEGO City",
  "description": "Текст из seo_content или metaDescription",
  "parentOrganization": {
    "@type": "Brand",
    "name": "LEGO",
    "url": "https://uhti.kz/brand/lego"
  }
}
```

#### 2. CollectionPage Schema
```json
{
  "@type": "CollectionPage",
  "name": "Товары бренда LEGO",
  "description": "...",
  "numberOfItems": 150,
  "offers": {
    "@type": "AggregateOffer",
    "lowPrice": 1990,
    "highPrice": 89990,
    "priceCurrency": "KZT",
    "offerCount": 150
  }
}
```

#### 3. ItemList Schema (топ-10 товаров)
```json
{
  "@type": "ItemList",
  "numberOfItems": 150,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "LEGO City Полицейский участок",
        "sku": "ABC123",
        "mpn": "ABC123",
        "gtin": "5702017153...",
        "brand": { "@type": "Brand", "name": "LEGO" },
        "offers": {
          "@type": "Offer",
          "price": 15990,
          "priceCurrency": "KZT",
          "availability": "https://schema.org/InStock",
          "priceSpecification": { /* для скидок */ },
          "hasMerchantReturnPolicy": { /* 14 дней */ },
          "shippingDetails": { /* бесплатная доставка */ }
        }
      }
    }
  ]
}
```

#### 4. BreadcrumbList Schema
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Бренды" },
    { "@type": "ListItem", "position": 2, "name": "LEGO" }
  ]
}
```

---

## UI-компоненты

### Страница бренда

**Стандартный шаблон:**
```
┌────────────────────────────────┐
│  Breadcrumbs                   │
├────────────────────────────────┤
│  Hero (лого, название, рейтинг)│
├────────────────────────────────┤
│  Линейки бренда (карточки)     │
├─────────────┬──────────────────┤
│  Фильтры (3)│  Товары (9)      │
│  - Категории│  - Сетка 3x3     │
│  - Атрибуты │  - Пагинация     │
│  - Цена     │                  │
├─────────────┴──────────────────┤
│  Отзывы о бренде               │
├────────────────────────────────┤
│  Описание бренда (сворачивается)│
├────────────────────────────────┤
│  SEO-контент (если заполнен)   │
└────────────────────────────────┘
```

**Кастомный шаблон:**
- Настраиваемые секции через `page_layout`
- Избранные линейки (`featuredLineIds`)
- Кастомные баннеры и блоки

### Страница линейки

```
┌────────────────────────────────┐
│  Breadcrumbs                   │
├────────────────────────────────┤
│  Hero (лого линейки, бренд)    │
├─────────────┬──────────────────┤
│  Фильтры (3)│  Товары (9)      │
│             │                  │
├─────────────┴──────────────────┤
│  Отзывы о бренде               │
├────────────────────────────────┤
│  Описание линейки (сворачивается)│
├────────────────────────────────┤
│  SEO-контент (если заполнен)   │
└────────────────────────────────┘
```

### Мобильный
- Drawer для фильтров (BrandFilterMobile)
- Sticky кнопка "Фильтры" внизу
- Адаптивная сетка товаров (2 колонки)

---

## Ключевые фичи

### 1. Умная фильтрация (useBrandPageFilters)
```typescript
// Реактивные фильтры с URL-синхронизацией
filterState.selectedCategories  // Set<string>
filterState.selectedAttributes  // Map<string, Set<string>>
filterState.priceRange          // [min, max]

// Автоматическая загрузка при изменении
watch([selectedCategories, selectedAttributes], () => {
  filterState.loadProducts()
})
```

### 2. Агрегированная статистика
```typescript
// RPC-функция get_brand_stats
{
  average_rating: 4.7,
  total_reviews_count: 1234
}
```

### 3. Кастомные шаблоны
```typescript
interface BrandPageLayout {
  featuredLineIds?: string[]
  customSections?: Array<{
    type: 'banner' | 'text' | 'products'
    content: any
  }>
}
```

### 4. SEO-контент с иконками
```typescript
// Парсинг HTML → структурированные блоки
const seoBlocks = parseHTMLToBlocks(brand.seo_content)
// Извлечение текста для Schema.org
const seoContentText = seoBlocks.map(b => b.text).join(' ')
```

---

## Интеграция с Store

### Используемые Store
- **productsStore** — fetchAllBrands, fetchProductsByIds
- **cartStore** — addItem (из карточек товаров)
- **filterState** (composable) — loadProducts, loadFilterData

---

## Производительность

### Кэширование
```typescript
// useAsyncData с ключами
brand:        key: `brand-${brandSlug}`
productLine:  key: `product-line-${brandSlug}-${lineSlug}`

// Предзагрузка брендов в store
productsStore.fetchAllBrands() // 1 раз при старте
```

### Оптимизация запросов
- Параллельная загрузка бренда и линеек
- RPC для агрегированной статистики (1 запрос вместо N)
- Фильтрация на стороне БД (Supabase filters)

---

## Обработка ошибок

```typescript
// 404 если бренд не найден
if (!brand.value) {
  // Показываем заглушку с кнопкой "Все бренды"
}

// Fallback для линейки
if (!productLine.value) {
  // Редирект на страницу бренда
}
```

---

## Связанные компоненты

- `BrandStandardTemplate` — стандартный шаблон страницы бренда
- `BrandCustomTemplate` — кастомный шаблон с настройками
- `BrandSEOContentRenderer` — SEO-контент (h2, h3, p, ul с иконками)
- `BrandDescription` — описание бренда с HTML
- `ProductLineDescription` — описание линейки
- `BrandFilterSidebar` — боковая панель фильтров (десктоп)
- `BrandFilterMobile` — drawer фильтров (мобильный)
- `BrandReviewsList` — отзывы о бренде
- `ProductCard` — карточка товара в сетке

---

## SEO-тикеты (реализованные)

1. **Brand Schema** — полная разметка с subOrganization
2. **CollectionPage Schema** — агрегированные данные о товарах
3. **ItemList Schema** — топ-10 товаров с полными данными
4. **SEO-контент в Schema.org** — текст из seo_content попадает в description
5. **Семантическая связь** — parentOrganization для линеек
6. **Merchant Return Policy** — политика возврата в Offer
7. **Shipping Details** — информация о доставке

---

## Утилиты

### cleanDescription
```typescript
// Очистка HTML + обрезка до N символов
function cleanDescription(html: string, maxLength = 200): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength)
}
```

### getProductSku
```typescript
// SKU из БД или fallback из ID
function getProductSku(product: { sku?: string; id: string }): string {
  if (product.sku) return product.sku
  return product.id.replace(/-/g, '').substring(0, 10).toUpperCase()
}
```

### buildProductDescription
```typescript
// Описание с упоминанием серии для Schema.org
function buildProductDescription(
  product: { description?: string; name: string },
  brandName: string,
  lineName: string,
  maxLength = 200
): string {
  const prefix = `${brandName} ${lineName}: `
  const base = cleanDescription(product.description, maxLength - prefix.length)
  return `${prefix}${base}`.substring(0, maxLength)
}
```

---

## Будущие улучшения

- [ ] Infinite scroll для товаров
- [ ] Сохранение фильтров в localStorage
- [ ] Сравнение товаров внутри бренда
- [ ] История просмотров по бренду
- [ ] Рекомендации на основе бренда
