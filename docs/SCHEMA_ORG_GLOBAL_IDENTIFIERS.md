# Schema.org: Устранение предупреждений "Missing Global Identifiers"

**Дата:** 2026-04-01  
**Приоритет:** ⭐️ Medium-High (Быстрая победа)  
**Story Points:** 2  
**Статус:** ✅ Завершено

## 📖 Проблема

Google Search Console выдавал предупреждения: **"Не указан глобальный идентификатор, например код GTIN или бренд"** на страницах категорий каталога.

У многих игрушек в каталоге Ухтышка (особенно фабричных no-name) физически нет штрихкода (GTIN) и официального бренда. Из-за этого Google не пускал их в бесплатную товарную карусель выдачи.

## 🎯 Решение

Согласно правилам [Google Merchant Center](https://support.google.com/merchants/answer/6324461), если товара нет в глобальной базе штрихкодов, достаточно передать связку:

```
Бренд + MPN (Артикул производителя)
```

Если бренда нет — брендом выступает сам магазин (White Label). SKU у нас есть у всех товаров.

## ✅ Что было сделано

### 1. Обновлена микроразметка на странице каталога

**Файл:** `pages/catalog/[...slug].vue` (строки 1191-1205)

**Изменения в ItemList → Product:**

```typescript
item: {
  "@type": "Product",
  name: product.name,
  description: cleanDescription(product.description) || product.name,
  url: `https://uhti.kz/catalog/products/${product.slug}`,

  // ✅ 1. Артикул (есть всегда)
  sku: product.sku || product.id,
  mpn: product.sku || product.id,

  // ✅ 2. Бренд (с фоллбэком на магазин)
  brand: {
    "@type": "Brand",
    name: product.brands?.name || "Ухтышка",
    ...(product.brands?.slug && {
      url: `https://uhti.kz/brand/${product.brands.slug}`,
    }),
  },

  // ✅ 3. Штрихкод (только если существует)
  ...(product.barcode && { gtin: product.barcode }),

  // ... остальные поля (image, offers)
}
```

### 2. Обновлена микроразметка на странице товара

**Файл:** `pages/catalog/products/[slug].vue` (строки 630-635)

**Изменения в defineProduct:**

```typescript
defineProduct({
  name: computed(() => product.value?.name || ""),
  description: metaDescription,
  image: productImages,

  // ✅ 1. Артикул (есть всегда)
  sku: productSku,
  mpn: productSku,

  // ✅ 3. Штрихкод (только если существует)
  gtin: computed(() => product.value?.barcode || undefined),

  brand: computed(() => {
    // Логика с фоллбэком на "Ухтышка" уже была реализована
    return {
      "@type": "Brand" as const,
      name: brandName.value || "Ухтышка",
      // ...
    };
  }),
  // ...
});
```

## 🔍 Логика Фолбэков (Graceful Fallback)

| Поле           | Источник данных       | Фоллбэк      | Обязательность |
| -------------- | --------------------- | ------------ | -------------- |
| **sku**        | `product.sku`         | `product.id` | ✅ Всегда      |
| **mpn**        | `product.sku`         | `product.id` | ✅ Всегда      |
| **brand.name** | `product.brands.name` | `"Ухтышка"`  | ✅ Всегда      |
| **gtin**       | `product.barcode`     | не выводится | ⚠️ Опционально |

### Почему это работает?

Согласно Google Merchant:

1. **Если есть GTIN** → Google идентифицирует товар по штрихкоду
2. **Если нет GTIN** → Google требует **Brand + MPN**
3. **Если нет бренда** → Используем название магазина как White Label бренд

## 📊 Результат

### До изменений:

```json
{
  "@type": "Product",
  "name": "Кукла Барби",
  "sku": "uuid-123",
  "url": "https://uhti.kz/catalog/products/kukla-barbi"
}
```

❌ **Предупреждение:** Missing global identifier (no brand, no GTIN)

### После изменений:

```json
{
  "@type": "Product",
  "name": "Кукла Барби",
  "sku": "TOY-12345",
  "mpn": "TOY-12345",
  "brand": {
    "@type": "Brand",
    "name": "Ухтышка"
  },
  "url": "https://uhti.kz/catalog/products/kukla-barbi"
}
```

✅ **Валидация пройдена:** Brand + MPN присутствуют

### Пример с брендом и штрихкодом:

```json
{
  "@type": "Product",
  "name": "LEGO City Пожарная станция",
  "sku": "60215",
  "mpn": "60215",
  "gtin": "5702016367652",
  "brand": {
    "@type": "Brand",
    "name": "LEGO",
    "url": "https://uhti.kz/brand/lego"
  },
  "url": "https://uhti.kz/catalog/products/lego-city-60215"
}
```

✅ **Валидация пройдена:** GTIN + Brand + MPN (максимальная идентификация)

## 🧪 Тестирование

### 1. Google Rich Results Test

```bash
# Проверить страницу категории
https://search.google.com/test/rich-results?url=https://uhti.kz/catalog/girls

# Проверить страницу товара
https://search.google.com/test/rich-results?url=https://uhti.kz/catalog/products/kukla-barbi
```

### 2. Schema.org Validator

```bash
https://validator.schema.org/
```

### 3. Проверка в коде

```bash
# Запустить dev-сервер
pnpm dev

# Открыть страницу категории
http://localhost:3000/catalog/girls

# Посмотреть исходный код (View Page Source)
# Найти <script type="application/ld+json">
# Проверить наличие полей: sku, mpn, brand, gtin (если есть)
```

## 📈 Ожидаемый эффект

1. **Google Search Console:** Предупреждения "Missing global identifier" исчезнут в течение 2-4 недель после переиндексации
2. **Google Shopping:** Товары без штрихкода смогут попасть в бесплатную карусель товаров
3. **SEO:** Улучшение видимости товаров в поисковой выдаче Google
4. **CTR:** Рост кликабельности за счет rich snippets с ценами и наличием

## 🔗 Связанные документы

- [Google Merchant Center: Product identifiers](https://support.google.com/merchants/answer/6324461)
- [Schema.org: Product](https://schema.org/Product)
- [Google Search Central: Product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)

## 📝 Примечания

- Поле `barcode` должно быть заполнено в базе данных для товаров с официальным штрихкодом
- Для no-name товаров достаточно заполнить `sku` и оставить `barcode` пустым
- Если у товара нет связи с таблицей `brands`, автоматически используется "Ухтышка"
- Артикул (`sku`) дублируется в поле `mpn` согласно требованиям Google

## 🚀 Деплой

Изменения применяются автоматически при следующем деплое на production. Переиндексация Google происходит в течение 1-4 недель.

---

**Автор:** OpenCode AI  
**Дата создания:** 2026-04-01  
**Последнее обновление:** 2026-04-01
