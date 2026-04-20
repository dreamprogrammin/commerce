# 🔥 Автоматическое спасение SEO-веса удаленных Брендов и Категорий

## 📖 Проблема

После сброса базы данных часть брендов (`/brand/[slug]`) и категорий (`/catalog/[...slug]`) навсегда исчезли из каталога. 

**До внедрения:**
- Переход на несуществующий бренд/категорию → HTTP 200 OK + заглушка "Не найдено"
- Google Search Console → ошибка **Soft 404** (страница выглядит как 404, но отдает 200)
- Результат: **Потеря SEO-веса** и пессимизация сайта

**После внедрения:**
- Переход на несуществующий бренд/категорию → HTTP 301 Moved Permanently
- Google Search Console → статус "Страница с переадресацией" (норма)
- Результат: **SEO-вес передается** на новую страницу, трафик сохраняется

---

## ✅ Что реализовано

### 1. Редирект для несуществующих брендов

**Файл:** `pages/brand/[slug].vue`

**Логика:**
```typescript
// После загрузки данных о бренде
const { data: brand, pending: brandPending } = await useAsyncData(...)

// Если бренд не найден → 301 редирект на /brands
if (!brand.value && !brandPending.value) {
  await navigateTo('/brands', { redirectCode: 301 })
}
```

**Примеры:**
- `/brand/cada` (удален) → 301 → `/brands`
- `/brand/old-brand` (удален) → 301 → `/brands`

---

### 2. Редирект для несуществующих категорий

**Файл:** `pages/catalog/[...slug].vue`

**Логика:**
```typescript
// После загрузки категорий
await useAsyncData('catalog-meta-...', () => categoriesStore.fetchCategoryData())

// Если категория не найдена (кроме /catalog/all) → 301 редирект на /catalog
if (currentCategorySlug.value !== 'all' && !currentCategory.value && categoriesStore.allCategories.length > 0) {
  await navigateTo('/catalog', { redirectCode: 301 })
}
```

**Примеры:**
- `/catalog/spinners` (удален) → 301 → `/catalog`
- `/catalog/old-category` (удален) → 301 → `/catalog`

---

### 3. Редирект для несуществующих линеек бренда

**Файл:** `pages/brand/[brandSlug]/[lineSlug].vue`

**Логика:**
```typescript
// После загрузки бренда
const { data: brand, pending: brandPending } = await useAsyncData(...)

// Если бренд не найден → 301 редирект на /brands
if (!brand.value && !brandPending.value) {
  await navigateTo('/brands', { redirectCode: 301 })
}

// После загрузки линейки
const { data: productLine, pending: linePending } = await useAsyncData(...)

// Если линейка не найдена → 301 редирект на страницу бренда
if (brand.value && !productLine.value && !linePending.value) {
  await navigateTo(`/brand/${brand.value.slug}`, { redirectCode: 301 })
}
```

**Примеры:**
- `/brand/nonexistent/marvel` → 301 → `/brands` (бренд не найден)
- `/brand/lego/nonexistent-line` → 301 → `/brand/lego` (линейка не найдена)

---

## 🎯 Преимущества

### До внедрения:
```
GET /brand/cada
← 200 OK
← HTML: "Бренд не найден"
→ Google: "Soft 404" ❌
→ SEO-вес: Потерян ❌
→ Трафик: Потерян ❌
```

### После внедрения:
```
GET /brand/cada
← 301 Moved Permanently
← Location: /brands
→ Google: "Редирект" ✅
→ SEO-вес: Передан на /brands ✅
→ Трафик: Сохранен ✅
```

---

## 📊 Ожидаемые результаты

### Краткосрочные (1-2 недели):
- ✅ Исчезновение ошибок "Soft 404" в Google Search Console
- ✅ Появление статуса "Страница с переадресацией" (норма)
- ✅ Сохранение трафика с битых ссылок

### Долгосрочные (1-3 месяца):
- ✅ Передача SEO-веса со старых страниц на новые
- ✅ Сохранение позиций в поиске
- ✅ Рост авторитета домена (Domain Authority)

---

## 🧪 Как проверить

### 1. Проверка редиректа бренда:
```bash
curl -I https://uhti.kz/brand/nonexistent-brand
# Ожидаемый результат:
# HTTP/2 301
# location: /brands
```

### 2. Проверка редиректа категории:
```bash
curl -I https://uhti.kz/catalog/nonexistent-category
# Ожидаемый результат:
# HTTP/2 301
# location: /catalog
```

### 3. Проверка в браузере:
1. Откройте DevTools → Network
2. Перейдите на несуществующий бренд/категорию
3. Проверьте статус: должен быть **301** (не 200)

---

## 🔧 Техническая реализация

### Ключевые моменты:

1. **Используется `navigateTo` с `redirectCode: 301`**
   - Это встроенная функция Nuxt 3/4
   - Работает на SSR (Server-Side Rendering)
   - Отдает правильный HTTP-статус

2. **Проверка выполняется ПОСЛЕ загрузки данных**
   - Сначала пытаемся найти бренд/категорию
   - Только если не найдено → редирект
   - Избегаем ложных срабатываний

3. **Редирект работает на сервере**
   - Googlebot получает 301 сразу
   - Не нужно ждать загрузки JS
   - SEO-оптимально

---

## 📝 Дополнительные рекомендации

### Если нужен редирект на конкретную страницу:

Для особых случаев используйте `nuxt.config.ts`:

```typescript
// nuxt.config.ts
nitro: {
  routeRules: {
    // Конкретный бренд → конкретная замена
    '/brand/cada': { 
      redirect: { to: '/brand/lego', statusCode: 301 } 
    },
    
    // Конкретная категория → родительская категория
    '/catalog/boys/old-toys': { 
      redirect: { to: '/catalog/boys', statusCode: 301 } 
    },
  }
}
```

### Мониторинг:

1. **Google Search Console** → Coverage → Excluded
   - Следите за уменьшением "Soft 404"
   - Проверяйте появление "Redirect"

2. **Логи сервера**
   - Отслеживайте 301 редиректы
   - Анализируйте, какие страницы чаще всего редиректятся

---

## 🎓 Итог

✅ **Реализовано:**
- Автоматический 301 редирект для несуществующих брендов → `/brands`
- Автоматический 301 редирект для несуществующих категорий → `/catalog`
- Автоматический 301 редирект для несуществующих линеек → `/brand/[brandSlug]`
- Защита от Soft 404 и потери SEO-веса

✅ **Результат:**
- Сохранение трафика с битых ссылок
- Передача SEO-веса на активные страницы
- Улучшение показателей в Google Search Console

✅ **Дополнительно:**
- Для особых случаев используйте `nuxt.config.ts`
- Мониторьте результаты в Google Search Console
- Восстанавливайте категории/бренды/линейки с сохранением старых slug

---

## 📚 Связанные документы

- `RECOVERY_CHECKLIST.md` - Список критичных категорий и брендов
- `HOW_TO_ADD_301_REDIRECTS.js` - Шаблоны для ручных редиректов
- `URGENT_RECOVERY_PLAN.md` - План восстановления после ресета БД
