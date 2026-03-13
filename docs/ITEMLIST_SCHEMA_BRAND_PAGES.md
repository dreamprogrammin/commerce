# ItemList Schema.org для страниц брендов — Отчет

## Описание

Улучшена JSON-LD разметка `ItemList` на страницах брендов (`/brand/[slug]`) и линеек (`/brand/[brandSlug]/[lineSlug]`), чтобы Google мог формировать расширенные сниппеты с карточками товаров и ценами.

---

## Что изменено

### Страница бренда (`/brand/[slug]`)

**Было:**
- `ItemList` ограничен 10 товарами (`slice(0, 10)`)
- Без поля `name`
- Цена только `price` (без учёта `final_price`)
- Без `description`, `sku`, `aggregateRating` на уровне товара
- Без `url` в `Offer`

**Стало:**
- Все товары бренда включены (без лимита)
- `name`: «Товары бренда {BrandName}»
- Цена: `final_price ?? price` — всегда актуальная
- Каждый `Product` содержит:
  - `name`, `url`, `image`, `sku`, `description` (до 200 символов)
  - `brand` с `@id` ссылкой на Brand schema
  - `offers` с `price`, `priceCurrency: KZT`, `availability`, `url`
  - `aggregateRating` (если есть отзывы на товар)
- Порядок товаров = порядок в каталоге (реактивно меняется при смене сортировки)

### Страница линейки (`/brand/[brandSlug]/[lineSlug]`)

**Было:**
- `ItemList` внутри `CollectionPage.mainEntity`, ограничен 10 товарами
- Без `name`, `description`, `sku`, `aggregateRating`
- `brand` — только `@id` без `name`

**Стало:**
- Все товары линейки (без лимита)
- `name`: «Товары {LineName} от {BrandName}»
- Те же улучшения по полям что и на странице бренда
- `brand` содержит `@type`, `@id` и `name`

---

## Пример сгенерированного JSON-LD

```json
{
  "@context": "https://schema.org",
  "@type": "ItemList",
  "name": "Товары бренда LEGO",
  "numberOfItems": 42,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "LEGO City 60355 Водная полиция",
        "url": "https://uhti.kz/catalog/products/lego-city-60355",
        "description": "Набор LEGO City с полицейским катером...",
        "image": "https://storage.uhti.kz/product-images/lego-60355.webp",
        "sku": "lego-city-60355",
        "brand": {
          "@type": "Brand",
          "@id": "https://uhti.kz/brand/lego#brand",
          "name": "LEGO"
        },
        "offers": {
          "@type": "Offer",
          "price": 19950,
          "priceCurrency": "KZT",
          "availability": "https://schema.org/InStock",
          "url": "https://uhti.kz/catalog/products/lego-city-60355"
        },
        "aggregateRating": {
          "@type": "AggregateRating",
          "ratingValue": 4.8,
          "reviewCount": 12,
          "bestRating": 5,
          "worstRating": 1
        }
      }
    }
  ]
}
```

---

## Реактивность

JSON-LD обновляется автоматически при:
- Смене сортировки (по цене, новизне, популярности) — `position` пересчитывается
- Применении фильтров — список товаров обновляется
- Загрузке новых данных — цены и наличие всегда актуальны

Это работает благодаря тому, что `innerHTML` в `useHead()` принимает функцию (`() =>`), которая вызывается при каждом рендере, а `filterState.products` — реактивный `ShallowRef`.

---

## Изменённые файлы

| Файл | Изменение |
|------|-----------|
| `pages/brand/[slug].vue` | Обновлён ItemList: без лимита, `final_price`, `description`, `sku`, `aggregateRating`, `name` |
| `pages/brand/[brandSlug]/[lineSlug].vue` | Обновлён ItemList в CollectionPage.mainEntity: аналогичные улучшения |

---

## Проверка

1. Открыть страницу бренда → View Source → найти `ItemList`
2. Проверить через [Google Rich Results Test](https://search.google.com/test/rich-results)
3. Убедиться что при смене сортировки `position` в JSON-LD меняется (DevTools → Elements → `script[type="application/ld+json"]`)
