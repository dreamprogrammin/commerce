# SEO Fix Documentation

**Проект:** uhti.kz — Интернет-магазин Ухтышка
**Дата:** 29 марта 2026

---

## 1. Описание проблемы

Google Rich Results Test показывал только 2 элемента вместо 5:

| Элемент | Статус до исправления |
|---|---|
| Строки навигации | ✅ Обнаружен без ошибок |
| Организация | ✅ Обнаружен без ошибок |
| Product | ❌ Не обнаружен |
| ItemList | ❌ Не обнаружен |
| FAQPage | ❌ Не обнаружен |

**Страницы с проблемой:**
- Товар: `/catalog/products/[slug]`
- Категория: `/catalog/constructors-root/konstruktory-malchikam?brand=lego`

---

## 2. Корневая причина

### 2.1 Страница товара — Product schema

> **Диагноз:** `useHead()` вызывался без проверки на наличие данных товара.
> При SSR-рендере `product.value === null`, потому что TanStack Query ещё не заполнил кеш.
> Google получал JSON-LD с `price: 0` и `name: "Товар | Ухтышка"` — невалидный объект, который игнорируется.

### 2.2 Страница каталога — ItemList + FAQPage

> **Диагноз:** `useCatalogQuery` использовал `useQuery` без SSR prefetch.
> На сервере `query.data.value === undefined` → `displayedProducts` пуст → `ItemList` не генерировался → Google не видел товары.
>
> `FAQPage` блокировался при любых активных фильтрах (`hasActiveFilters`),
> что исключало Brand Landing страницы (`?brand=lego`) из индексации FAQ.

---

## 3. Что было исправлено

### 3.1 `pages/catalog/products/[slug].vue`

#### Guard в useHead

**Было** — `useHead` всегда генерировал Product schema даже с пустыми данными:

```ts
useHead(() => ({
  script: [{
    type: 'application/ld+json',
    children: JSON.stringify({
      '@type': 'Product',
      'name': metaTitle.value,       // = "Товар | Ухтышка" если нет данных
      'offers': { 'price': product.value?.price || 0 }  // = 0
    })
  }]
}))
```

**Стало** — guard возвращает пустой объект если данных нет:

```ts
useHead(() => {
  if (!product.value) return {}  // ← ключевой guard

  return {
    meta: [...],   // только meta-теги
    link: [...],   // только canonical
    // JSON-LD скриптов здесь больше нет
  }
})
```

#### Product schema перенесена в useSchemaOrg

`productJsonLd` вынесен в отдельный `computed` с guard:

```ts
const productJsonLd = computed(() => {
  if (!product.value) return null  // никогда не строим пустую схему

  const finalPrice = p.discount_percentage
    ? Math.round(Number(p.price) * (100 - p.discount_percentage) / 100)
    : Math.round(Number(p.price))

  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    // ... реальные данные товара
  }
})
```

Schema регистрируется через `useSchemaOrg` — гарантированный SSR:

```ts
// Вызывается в корне <script setup>, вне условий и хуков
useSchemaOrg([defineProduct({
  name: metaTitle,
  description: metaDescription,
  image: productImages,
  offers: computed(() => {
    if (!product.value) return undefined
    // ...
  }),
  aggregateRating: computed(() => { ... }),
  review: computed(() => { ... }),
})])
```

> **Почему `useSchemaOrg` надёжнее `useHead scripts`:**
> `useHead scripts` обновляются через Vue реактивность — могут опаздывать при SSR.
> `useSchemaOrg` из модуля `nuxt-schema-org` вставляет JSON-LD синхронно в SSR pipeline.
> Google получает полные данные при первом чтении страницы, без задержек.

---

### 3.2 `composables/useCatalogQuery.ts` — SSR Prefetch

**Проблема:** `useQuery` без prefetch — на сервере данных нет, `ItemList` пустой.

**Решение** — добавлен `useAsyncData` + `queryClient.setQueryData`:

```ts
if (import.meta.server) {
  const { data: ssrData } = useAsyncData(
    ssrKey.value,
    () => queryFn(),
    { server: true },  // ← дожидаемся на сервере
  )

  if (ssrData.value) {
    // Кладём в кеш TanStack Query — useQuery возьмёт через initialData
    queryClient.setQueryData(queryKey.value, ssrData.value)
  }
}

const query = useQuery({
  queryKey,
  queryFn,
  // На сервере берём данные из кеша (setQueryData выше)
  initialData: import.meta.server
    ? queryClient.getQueryData(queryKey.value)
    : undefined,
  // ...остальные опции без изменений
})
```

**Результат:**

- `useAsyncData` дожидается данных синхронно (Nuxt SSR pipeline)
- Данные кладутся в кеш TanStack Query через `setQueryData`
- `useQuery` получает их через `initialData` — `data.value` заполнен на сервере
- `displayedProducts` содержит товары в момент генерации HTML
- `ItemList` попадает в SSR HTML и Google его индексирует

---

### 3.3 `pages/catalog/[...slug].vue` — FAQPage + схемы

#### FAQPage на Brand Landing

**Было** — FAQ блокировался при любых фильтрах:

```ts
if (faqQuestions.value.length > 0 && !hasActiveFilters.value) {
```

**Стало** — FAQ разрешён на Brand Landing (`?brand=X`):

```ts
if (faqQuestions.value.length > 0 && (!hasActiveFilters.value || activeBrand.value)) {
```

Теперь FAQPage показывается:
- На обычных страницах категории без фильтров — как раньше
- На Brand Landing (`?brand=lego`) — **новое**, даже если фильтр бренда активен

#### Все схемы перенесены из useHead в useSchemaOrg

**Было** — ручные JSON строки в `useHead scripts` (ненадёжный SSR):

```ts
useHead(() => ({
  script: [CollectionPage, ItemList, FAQPage].map(s => ({
    type: 'application/ld+json',
    children: JSON.stringify(s)
  }))
}))
```

**Стало** — реактивный `useSchemaOrg` (гарантированный SSR):

```ts
useSchemaOrg(computed(() => {
  const schemas = []

  schemas.push({ '@type': 'CollectionPage', ... })

  if (navParts.length > 0)
    schemas.push({ '@type': 'SiteNavigationElement', ... })

  // ItemList рендерится только если useCatalogQuery вернул данные на сервере
  if (displayedProducts.value.length > 0)
    schemas.push({ '@type': 'ItemList', ... })

  // FAQPage теперь работает и на Brand Landing
  if (faqQuestions.value.length > 0 && (!hasActiveFilters.value || activeBrand.value))
    schemas.push({ '@type': 'FAQPage', ... })

  return schemas
}))
```

`useHead` очищен — теперь только meta и canonical, без JSON-LD:

```ts
useHead(() => ({
  meta: [{ name: 'keywords', content: metaKeywords.value || '' }],
  link: [{ rel: 'canonical', href: canonicalUrl.value }],
}))
```

---

## 4. Итог по файлам

| Файл | Изменения |
|---|---|
| `pages/catalog/products/[slug].vue` | Guard в `useHead`; `productJsonLd` в `computed`; Product schema через `useSchemaOrg` |
| `composables/useCatalogQuery.ts` | SSR prefetch через `useAsyncData` + `queryClient.setQueryData` |
| `pages/catalog/[...slug].vue` | FAQPage с `activeBrand`; все схемы перенесены в `useSchemaOrg` |

---

## 5. Ожидаемый результат

Google Rich Results Test после деплоя:

| Элемент | Статус после исправления |
|---|---|
| Строки навигации | ✅ Обнаружен без ошибок |
| Организация | ✅ Обнаружен без ошибок |
| Product | ✅ Обнаружен на страницах товаров |
| ItemList | ✅ Обнаружен на страницах категорий |
| FAQPage | ✅ Обнаружен на категориях и Brand Landing |

### Как проверить

1. Задеплоить изменения
2. Открыть `view-source` на странице товара
3. Найти `<script type="application/ld+json">` и убедиться что `name` — реальное название товара, `price` — реальная цена (не 0)
4. Открыть [search.google.com/test/rich-results](https://search.google.com/test/rich-results)
5. Проверить страницу товара и страницу категории
6. Убедиться что Product, ItemList и FAQPage теперь обнаружены