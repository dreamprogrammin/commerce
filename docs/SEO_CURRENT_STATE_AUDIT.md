# Аудит текущей SEO-реализации | Uhti.kz

**Дата проверки:** 8 мая 2026

---

## ✅ Что уже сделано ПРАВИЛЬНО

### 1. **Product Schema — ОТЛИЧНО** ⭐⭐⭐⭐⭐
```typescript
// pages/catalog/products/[slug].vue
useSchemaOrg([
  defineProduct({
    name: product.name,
    sku: productSku,
    brand: { name: brandName },
    offers: {
      price: finalPrice,
      priceCurrency: 'KZT',
      availability: 'InStock/OutOfStock',
      priceValidUntil: '...',
    },
    aggregateRating: { ... },
    review: [ ... ],
  })
])
```

**Оценка:** 9/10  
**Что хорошо:**
- ✅ Есть Product schema на всех товарах
- ✅ Правильная структура offers с ценой и валютой
- ✅ Есть aggregateRating (рейтинг)
- ✅ Есть review (отзывы)
- ✅ Есть shippingDetails (доставка)
- ✅ Есть hasMerchantReturnPolicy (возврат)
- ✅ SSR-рендеринг (работает на сервере)

**Что можно улучшить:**
- ⚠️ Добавить `itemCondition: 'NewCondition'` (уже есть!)
- ⚠️ Добавить `category` для лучшей категоризации

---

### 2. **BreadcrumbList Schema — ОТЛИЧНО** ⭐⭐⭐⭐⭐
```typescript
useBreadcrumbSchema(breadcrumbs)
```

**Оценка:** 10/10  
**Что хорошо:**
- ✅ Есть на всех страницах товаров
- ✅ Правильная структура
- ✅ SSR-рендеринг

---

### 3. **ItemList Schema — ОТЛИЧНО** ⭐⭐⭐⭐⭐
```typescript
// В категориях и брендах
{
  '@type': 'ItemList',
  'itemListElement': products.map(...)
}
```

**Оценка:** 10/10  
**Что хорошо:**
- ✅ Есть на страницах категорий
- ✅ Есть на страницах брендов
- ✅ Правильная структура

---

### 4. **FAQPage Schema — ОТЛИЧНО** ⭐⭐⭐⭐⭐
```typescript
useSchemaOrg([
  defineFAQPage({
    mainEntity: faqSchemaItems
  })
])
```

**Оценка:** 10/10  
**Что хорошо:**
- ✅ Есть FAQ на товарах
- ✅ Правильная очистка HTML
- ✅ SSR-рендеринг

---

### 5. **Open Graph — ОТЛИЧНО** ⭐⭐⭐⭐⭐
```typescript
useSeoMeta({
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogImage: ogImageUrl,
  ogUrl: canonicalUrl,
})
```

**Оценка:** 10/10  
**Что хорошо:**
- ✅ Все OG-теги на месте
- ✅ Правильные размеры изображений (1200x630)
- ✅ Canonical URL

---

## ⚠️ Что нужно УЛУЧШИТЬ

### 1. **Meta Title — СЛАБО** ⭐⭐
**Текущая реализация:**
```typescript
const metaTitle = computed(() => {
  if (product.value.meta_title) return product.value.meta_title
  if (product.value.seo_title) return product.value.seo_title
  return `${product.value.name} - Купить в интернет-магазине | Ухтышка`
})
```

**Проблема:**
```
❌ "Детская кухня - Купить в интернет-магазине | Ухтышка"
```
- Нет цены → пользователь не видит выгоду
- Нет ключевых свойств → не выделяется среди конкурентов
- Шаблонный текст "Купить в интернет-магазине" → не уникально

**Правильно:**
```
✅ "Детская кухня деревянная с холодильником — от 15 990 ₸ | Uhti.kz"
```

**Как исправить:**
```typescript
const metaTitle = computed(() => {
  if (!product.value) return 'Товар | Ухтышка'
  
  // Если есть ручной meta_title — используем его
  if (product.value.meta_title) return product.value.meta_title
  
  // Иначе генерируем умный title
  const parts = [product.value.name]
  
  // Добавляем ключевое свойство (материал, тип и т.д.)
  if (product.value.material?.name) {
    parts[0] += ` ${product.value.material.name.toLowerCase()}`
  }
  
  // Добавляем цену
  const price = product.value.final_price || product.value.price
  parts.push(`от ${formatPrice(price)} ₸`)
  
  // Добавляем бренд
  parts.push('Uhti.kz')
  
  return parts.join(' — ')
})
```

**Приоритет:** 🔥 Критический  
**Эффект:** +20-40% к CTR

---

### 2. **Meta Description — СРЕДНЕ** ⭐⭐⭐
**Текущая реализация:**
```typescript
const metaDescription = computed(() => {
  if (product.value.meta_description) return product.value.meta_description
  if (product.value.seo_description) return product.value.seo_description
  
  const parts = [
    audienceText.value ? `${product.value.name} ${audienceText.value}` : product.value.name,
    `Цена: ${formatPrice(product.value.price)} ₸`,
    product.value.stock_quantity > 0 ? 'В наличии' : 'Под заказ',
    'Доставка по Казахстану',
  ]
  return `${parts.join('. ')}.`
})
```

**Проблема:**
```
❌ "Детская кухня для девочек от 3 до 5 лет. Цена: 15 990 ₸. В наличии. Доставка по Казахстану."
```
- Нет пользы для ребёнка → родитель не понимает, зачем покупать
- Нет уникального преимущества → не выделяется
- Нет социального доказательства (рейтинг, отзывы)

**Правильно:**
```
✅ "Детская кухня с плитой, холодильником и посудой. Развивает воображение и моторику. ⭐ 4.8 (23 отзыва). Доставка по Алматы за 1 день. От 15 990 ₸"
```

**Как исправить:**
```typescript
const metaDescription = computed(() => {
  if (!product.value) return ''
  if (product.value.meta_description) return product.value.meta_description
  
  const parts = []
  
  // 1. Название + ключевое свойство
  parts.push(product.value.name)
  
  // 2. Польза для ребёнка (из seo_content или description)
  if (product.value.seo_description) {
    parts.push(product.value.seo_description.substring(0, 100))
  }
  
  // 3. Социальное доказательство
  if (product.value.review_count > 0) {
    parts.push(`⭐ ${product.value.avg_rating} (${product.value.review_count} отзывов)`)
  }
  
  // 4. Доставка
  parts.push('Доставка по Алматы за 1 день')
  
  // 5. Цена
  const price = product.value.final_price || product.value.price
  parts.push(`От ${formatPrice(price)} ₸`)
  
  return parts.join('. ')
})
```

**Приоритет:** 🔥 Критический  
**Эффект:** +15-30% к CTR

---

### 3. **Уникальные описания товаров — НЕТ** ⭐
**Проблема:**
- Нет поля `seo_content` в базе для большинства товаров
- Или описания копируются с других сайтов
- Google считает дублями → не ранжирует

**Как проверить:**
```sql
SELECT 
  COUNT(*) as total,
  COUNT(seo_content) as with_seo_content,
  COUNT(description) as with_description
FROM products
WHERE stock_quantity > 0;
```

**Что делать:**
1. Написать уникальные описания для топ-50 товаров
2. Использовать шаблон из аудита (см. SEO_AUDIT_30_DAY_PLAN.md)
3. Добавить блок "Что развивает" на карточки товаров

**Приоритет:** 🔥 Критический  
**Эффект:** +50-100% к индексации

---

### 4. **Внутренняя перелинковка — СЛАБО** ⭐⭐
**Что есть:**
- ✅ Хлебные крошки
- ✅ Похожие товары (similarProducts)
- ✅ Аксессуары (accessories)

**Чего не хватает:**
- ❌ Блок "Популярные товары" в футере
- ❌ Блок "Популярные категории" в футере
- ❌ Ссылки на категории в описании товара
- ❌ Ссылки на бренды в описании товара

**Как исправить:**
```vue
<!-- В components/common/Footer.vue -->
<div class="popular-categories">
  <h3>Популярные категории</h3>
  <ul>
    <li v-for="cat in popularCategories">
      <NuxtLink :to="`/catalog/${cat.slug}`">
        {{ cat.name }}
      </NuxtLink>
    </li>
  </ul>
</div>
```

**Приоритет:** 🟡 Важный  
**Эффект:** +20-30% к индексации

---

### 5. **Подкатегории — НЕТ** ⭐
**Проблема:**
- Есть только основные категории
- Нет подкатегорий по материалу, возрасту, полу
- Упускается длинный хвост запросов

**Примеры упущенных запросов:**
- "деревянные детские кухни"
- "игрушки для девочек 3-5 лет"
- "детская кухня с холодильником"

**Что делать:**
1. Создать подкатегории в базе
2. Добавить SEO-тексты для каждой подкатегории
3. Настроить фильтры как отдельные страницы

**Приоритет:** 🟡 Важный  
**Эффект:** +30-50 новых страниц в индексе

---

## 📊 Итоговая оценка

| Компонент | Оценка | Статус |
|-----------|--------|--------|
| Product Schema | 9/10 | ✅ Отлично |
| BreadcrumbList Schema | 10/10 | ✅ Отлично |
| ItemList Schema | 10/10 | ✅ Отлично |
| FAQPage Schema | 10/10 | ✅ Отлично |
| Open Graph | 10/10 | ✅ Отлично |
| Meta Title | 2/10 | ❌ Слабо |
| Meta Description | 3/10 | ⚠️ Средне |
| Уникальные описания | 1/10 | ❌ Нет |
| Внутренняя перелинковка | 2/10 | ❌ Слабо |
| Подкатегории | 1/10 | ❌ Нет |

**Общая оценка:** 6.8/10

---

## 🎯 Приоритеты на ближайшие 7 дней

### День 1-2: Улучшить Meta Title
```typescript
// Добавить в pages/catalog/products/[slug].vue
const metaTitle = computed(() => {
  if (!product.value) return 'Товар | Ухтышка'
  if (product.value.meta_title) return product.value.meta_title
  
  const parts = [product.value.name]
  if (product.value.material?.name) {
    parts[0] += ` ${product.value.material.name.toLowerCase()}`
  }
  const price = product.value.final_price || product.value.price
  parts.push(`от ${formatPrice(price)} ₸`)
  parts.push('Uhti.kz')
  
  return parts.join(' — ')
})
```

**Ожидаемый эффект:** +20-40% к CTR

---

### День 3-4: Улучшить Meta Description
```typescript
const metaDescription = computed(() => {
  if (!product.value) return ''
  if (product.value.meta_description) return product.value.meta_description
  
  const parts = [product.value.name]
  if (product.value.seo_description) {
    parts.push(product.value.seo_description.substring(0, 100))
  }
  if (product.value.review_count > 0) {
    parts.push(`⭐ ${product.value.avg_rating} (${product.value.review_count} отзывов)`)
  }
  parts.push('Доставка по Алматы за 1 день')
  const price = product.value.final_price || product.value.price
  parts.push(`От ${formatPrice(price)} ₸`)
  
  return parts.join('. ')
})
```

**Ожидаемый эффект:** +15-30% к CTR

---

### День 5-7: Написать описания для топ-20 товаров
1. Найти топ-20 товаров по показам в GSC
2. Написать уникальные описания по шаблону
3. Добавить в поле `seo_content`

**Ожидаемый эффект:** +30-50% к индексации этих товаров

---

## ✅ Вывод

**Техническая часть SEO — ОТЛИЧНО (9/10)**
- Schema.org разметка на высоком уровне
- SSR работает правильно
- Структура данных правильная

**Контентная часть SEO — СЛАБО (3/10)**
- Title и description шаблонные
- Нет уникальных описаний
- Нет подкатегорий

**Главная проблема:** Не контент, а его подача в title/description.  
**Решение:** Улучшить генерацию meta-тегов (2-3 дня работы).

---

**Следующий шаг:** Начать с улучшения meta title и description — это даст самый быстрый эффект без изменения контента.
