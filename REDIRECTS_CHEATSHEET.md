# ⚡ Быстрая шпаргалка: 301 Редиректы

## ✅ Что сделано

### 1. Бренды (`pages/brand/[slug].vue`)
```typescript
// Если бренд не найден → 301 на /brands
if (!brand.value && !brandPending.value) {
  await navigateTo('/brands', { redirectCode: 301 })
}
```

### 2. Категории (`pages/catalog/[...slug].vue`)
```typescript
// Если категория не найдена → 301 на /catalog
if (currentCategorySlug.value !== 'all' && !currentCategory.value && categoriesStore.allCategories.length > 0) {
  await navigateTo('/catalog', { redirectCode: 301 })
}
```

### 3. Линейки бренда (`pages/brand/[brandSlug]/[lineSlug].vue`)
```typescript
// Если бренд не найден → 301 на /brands
if (!brand.value && !brandPending.value) {
  await navigateTo('/brands', { redirectCode: 301 })
}

// Если линейка не найдена → 301 на страницу бренда
if (brand.value && !productLine.value && !linePending.value) {
  await navigateTo(`/brand/${brand.value.slug}`, { redirectCode: 301 })
}
```

---

## 🧪 Как проверить

### Вариант 1: Командная строка
```bash
# Проверка бренда
curl -I https://uhti.kz/brand/nonexistent-brand
# Должно быть: HTTP/2 301 + location: /brands

# Проверка линейки бренда
curl -I https://uhti.kz/brand/lego/nonexistent-line
# Должно быть: HTTP/2 301 + location: /brand/lego

# Проверка категории
curl -I https://uhti.kz/catalog/nonexistent-category
# Должно быть: HTTP/2 301 + location: /catalog
```

### Вариант 2: Автоматический скрипт
```bash
./test_redirects.sh
```

### Вариант 3: Браузер
1. Откройте DevTools → Network
2. Перейдите на несуществующий бренд/категорию
3. Проверьте статус: **301** (не 200!)

---

## 📊 Результаты

### До внедрения:
- ❌ HTTP 200 + "Не найдено"
- ❌ Soft 404 в Google Search Console
- ❌ Потеря SEO-веса

### После внедрения:
- ✅ HTTP 301 → новая страница
- ✅ "Страница с переадресацией" (норма)
- ✅ SEO-вес передается

---

## 🔧 Дополнительно

### Ручные редиректы (nuxt.config.ts):
```typescript
nitro: {
  routeRules: {
    '/brand/cada': { redirect: { to: '/brand/lego', statusCode: 301 } },
    '/catalog/spinners': { redirect: { to: '/catalog', statusCode: 301 } },
  }
}
```

---

## 📚 Документация

Полная документация: `docs/DYNAMIC_301_REDIRECTS.md`
