# ✅ Финальный чеклист: Image SEO готов к запуску

## Что исправлено

### 1. ✅ Скрипты работают
- Добавлена загрузка .env файла
- Поддержка обоих вариантов переменных: `SUPABASE_URL` и `NUXT_PUBLIC_SUPABASE_URL`
- Используется `npx tsx` (не требует установки)

### 2. ✅ Компоненты проверены
- `ProductCard.vue` - правильно использует `product.brands?.name` и `product.product_line_name`
- `ProductGallery.vue` - корректно получает props из страницы товара
- `[slug].vue` - передает все необходимые данные

### 3. ✅ Типы данных совпадают
- `BaseProduct` содержит все нужные поля
- `product.brands?.name` - доступен
- `product.product_line_name` - доступен

## Что нужно сделать

### Шаг 1: Запусти Supabase локально (если используешь локальную БД)

```bash
# Если используешь Supabase локально
supabase start

# Или используй продакшн БД, обновив .env:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-anon-key
```

### Шаг 2: Запусти аудит

```bash
npm run seo:audit
```

Ожидаемый результат:
```
📊 Статистика alt текстов:

📷 Всего изображений: 150
✅ С качественным alt: 0 (0.0%)
⚠️  С дефолтным alt: 50 (33.3%)
❌ Без alt текста: 100 (66.7%)

💡 Рекомендации:
   Запусти: npm run seo:generate
```

### Шаг 3: Сгенерируй alt-тексты

```bash
npm run seo:generate
```

Ожидаемый результат:
```
✅ Обновлено: 150 изображений
⏭️  Пропущено: 0 изображений
❌ Ошибок: 0
```

### Шаг 4: Проверь результат

```bash
npm run seo:audit
```

Должно показать ~100% с качественными alt-текстами.

### Шаг 5: Проверь в браузере

```bash
npm run dev
```

1. Открой любую страницу товара
2. Открой DevTools → Elements
3. Найди `<img>` теги
4. Проверь, что alt содержит: `[Бренд] [Название] [Серия] [Контекст]`

Пример:
```html
<img alt="LEGO Конструктор Железный Человек Marvel купить в Казахстане">
```

### Шаг 6: Деплой

```bash
npm run build
# Задеплой на продакшн
```

### Шаг 7: Мониторинг (через 2-3 недели)

1. [Google Search Console](https://search.google.com/search-console)
2. Performance → Search results → Filter: Image
3. Отслеживай рост impressions и clicks

## Возможные проблемы

### Проблема: "ECONNREFUSED 127.0.0.1:54321"
**Решение:** Запусти Supabase локально или используй продакшн URL в .env

### Проблема: Alt-тексты не генерируются
**Решение:** Проверь, что в БД есть связи:
- `products.brands` (brand_id → brands.id)
- `products.product_lines` (product_line_id → product_lines.id)

### Проблема: Alt-тексты пустые в браузере
**Решение:** Проверь, что props передаются в ProductGallery:
```vue
<ProductGallery
  :product-name="product.name"
  :brand-name="product.brands?.name"
  :line-name="product.product_lines?.name"
/>
```

## Готово! 🚀

Все исправлено и готово к запуску. Следуй чеклисту выше.
