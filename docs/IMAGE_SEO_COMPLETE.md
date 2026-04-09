# 🚀 Image SEO: Полная документация

## 📋 Оглавление

1. [Проблема и решение](#проблема-и-решение)
2. [Что было сделано](#что-было-сделано)
3. [Как это работает](#как-это-работает)
4. [Быстрый старт](#быстрый-старт)
5. [Генерация через админку](#генерация-через-админку)
6. [Технические детали](#технические-детали)
7. [Мониторинг и результаты](#мониторинг-и-результаты)

---

## Проблема и решение

### Проблема
Изображения товаров не индексируются в Google Images из-за отсутствия или плохого качества alt-текстов:
- ❌ `alt="Изображение товара 1"`
- ❌ `alt="Image"`
- ❌ `alt=""`

### Решение
SEO-оптимизированные alt-тексты по формуле:
```
[Бренд] + [Название товара] + [Серия] + [Контекст]
```

**Примеры:**
- ✅ `LEGO Конструктор Железный Человек Marvel купить в Казахстане`
- ✅ `Barbie Кукла Принцесса Disney вид сбоку`
- ✅ `Hot Wheels Трек Мертвая петля детальное фото`

---

## Что было сделано

### 📁 Создано 7 файлов

#### 1. `composables/useSeoAltText.ts`
Composable для генерации SEO-оптимизированных alt-текстов.

```typescript
const { generateProductImageAlt } = useSeoAltText()

const altText = generateProductImageAlt({
  productName: 'Конструктор Железный Человек',
  brandName: 'LEGO',
  lineName: 'Marvel',
  index: 0,
  totalImages: 5
})
// Результат: "LEGO Конструктор Железный Человек Marvel купить в Казахстане"
```

#### 2. `scripts/generate-alt-texts.ts`
Скрипт для массового обновления alt-текстов в БД.

```bash
npm run seo:generate
```

#### 3. `scripts/audit-alt-texts.ts`
Скрипт для аудита качества alt-текстов.

```bash
npm run seo:audit
```

#### 4-7. Документация
- `docs/IMAGE_SEO.md` - полная документация
- `docs/IMAGE_SEO_QUICKSTART.md` - быстрый старт
- `docs/IMAGE_SEO_CHECKLIST.md` - чеклист внедрения
- `docs/IMAGE_SEO_FINAL_CHECKLIST.md` - финальный чеклист после исправлений

### 🔧 Обновлено 5 файлов

#### 1. `components/global/ProductCard.vue`
Добавлена функция `getImageAlt()` для генерации alt-текстов в карточках товаров.

```typescript
function getImageAlt(index: number): string {
  const parts = [props.product.name]
  
  if (props.product.brands?.name) {
    parts.unshift(props.product.brands.name)
  }
  
  if (props.product.product_line_name) {
    parts.push(props.product.product_line_name)
  }
  
  if (index === 0) {
    parts.push("купить в Казахстане")
  } else {
    parts.push(`фото ${index + 1}`)
  }
  
  return parts.join(" ")
}
```

#### 2. `components/global/ProductGallery.vue`
Добавлены props и функция для умной генерации alt-текстов.

```vue
<ProductGallery
  :images="product.product_images"
  :product-name="product.name"
  :brand-name="product.brands?.name"
  :line-name="product.product_lines?.name"
/>
```

Приоритет alt-текстов:
1. `alt_text` из БД (если качественный)
2. Генерация на лету через composable
3. Fallback: "Изображение товара N"

#### 3. `pages/catalog/products/[slug].vue`
Передача данных в ProductGallery.

#### 4. `package.json`
Добавлены npm скрипты:

```json
{
  "scripts": {
    "seo:audit": "npx tsx scripts/audit-alt-texts.ts",
    "seo:generate": "npx tsx scripts/generate-alt-texts.ts"
  }
}
```

#### 5. `README.md`
Добавлены ссылки на документацию.

---

## Как это работает

### Логика генерации alt-текстов

```typescript
// Контекст зависит от позиции изображения:
if (index === 0) {
  context = 'купить в Казахстане'  // Локальное SEO
} else if (index === 1 && totalImages > 1) {
  context = 'вид сбоку'
} else if (index === 2 && totalImages > 2) {
  context = 'детальное фото'
} else if (index === totalImages - 1 && totalImages > 3) {
  context = 'в упаковке'
} else {
  context = `фото ${index + 1}`
}
```

### Где работает

1. **ProductCard** - карточки товаров в каталоге
   - Десктоп (hover эффект)
   - Мобильная карусель
   - SSR fallback

2. **ProductGallery** - галерея на странице товара
   - Миниатюры
   - Основная карусель
   - Lightbox (полноэкранный просмотр)

### Приоритет источников alt-текста

```
1. product_images.alt_text (из БД) - если качественный
   ↓
2. Генерация на лету (composable)
   ↓
3. Fallback: "Изображение товара N"
```

---

## Генерация через админку

### 🎯 Самый простой способ (рекомендуется)

1. Открой админку: `/admin/image-seo`
2. Нажми кнопку **"Сгенерировать Alt-тексты"**
3. Дождись завершения (увидишь статистику)

**Преимущества:**
- ✅ Не нужно запускать скрипты локально
- ✅ Работает прямо в браузере
- ✅ Показывает статистику в реальном времени
- ✅ Можно запускать когда угодно

**Скриншот:**
```
┌─────────────────────────────────────────┐
│ Генерация Alt-текстов для изображений   │
├─────────────────────────────────────────┤
│ [🔄 Сгенерировать Alt-тексты]          │
├─────────────────────────────────────────┤
│ ✅ Обновлено: 150                       │
│ 📷 Пропущено: 25                        │
│ 📊 Всего: 175                           │
└─────────────────────────────────────────┘
```

---

## Быстрый старт

### Шаг 1: Запусти Supabase

```bash
# Локально
supabase start

# Или используй продакшн, обновив .env:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_KEY=your-anon-key
```

### Шаг 2: Проверь текущее состояние

```bash
npm run seo:audit
```

**Ожидаемый результат:**
```
📊 Статистика alt текстов:

📷 Всего изображений: 150
✅ С качественным alt: 0 (0.0%)
⚠️  С дефолтным alt: 50 (33.3%)
❌ Без alt текста: 100 (66.7%)
```

### Шаг 3: Сгенерируй alt-тексты

```bash
npm run seo:generate
```

**Ожидаемый результат:**
```
✅ Обновлено: 150 изображений
⏭️  Пропущено: 0 изображений
❌ Ошибок: 0
```

### Шаг 4: Проверь результат

```bash
npm run seo:audit
```

**Ожидаемый результат:**
```
📊 Статистика alt текстов:

📷 Всего изображений: 150
✅ С качественным alt: 150 (100.0%)
⚠️  С дефолтным alt: 0 (0.0%)
❌ Без alt текста: 0 (0.0%)

✨ Примеры качественных alt текстов:
   lego-iron-man: "LEGO Конструктор Железный Человек Marvel купить в Казахстане"
   barbie-princess: "Barbie Кукла Принцесса Disney вид сбоку"
```

### Шаг 5: Проверь в браузере

```bash
npm run dev
```

1. Открой страницу товара
2. DevTools → Elements
3. Найди `<img>` теги
4. Проверь alt-тексты

### Шаг 6: Деплой

```bash
npm run build
# Задеплой на продакшн
```

---

## Технические детали

### Структура БД

**Таблица:** `product_images`

```sql
CREATE TABLE product_images (
  id UUID PRIMARY KEY,
  product_id UUID REFERENCES products(id),
  image_url TEXT NOT NULL,
  alt_text TEXT,  -- ← Это поле обновляется скриптом
  display_order INTEGER,
  blur_placeholder TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Типы данных

```typescript
interface BaseProduct {
  id: string
  name: string
  slug: string
  product_images: {
    image_url: string | null
    blur_placeholder?: string | null
  }[] | null
  brands?: {
    name: string
  } | null
  product_line_name?: string | null
}

interface ProductImageRow {
  id: string
  image_url: string
  alt_text: string | null
  display_order: number
}
```

### Переменные окружения

Скрипты поддерживают оба варианта:

```bash
# Вариант 1 (Nuxt)
NUXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NUXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...

# Вариант 2 (Локальный)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=eyJxxx...
```

### Зависимости

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.56.0"
  }
}
```

**Примечание:** `tsx` не требует установки, используется через `npx`.

---

## Мониторинг и результаты

### Google Search Console

1. Открой [Google Search Console](https://search.google.com/search-console)
2. **Performance** → **Search results**
3. Фильтр: **Search type** → **Image**
4. Отслеживай метрики:
   - **Impressions** - показы в поиске
   - **Clicks** - клики на изображения
   - **CTR** - процент кликов
   - **Position** - средняя позиция

### Ожидаемые результаты

| Период | Результат |
|--------|-----------|
| **2-3 недели** | Изображения начнут индексироваться в Google Images<br>Первые переходы из поиска по картинкам |
| **1-2 месяца** | Рост трафика из Google Images на 10-20%<br>Увеличение конверсии |
| **3-6 месяцев** | Рост трафика из Google Images на 20-40%<br>Стабильный поток бесплатного целевого трафика |

### Внутренний аудит

Регулярно проверяй качество alt-текстов:

```bash
npm run seo:audit
```

---

## Возможные проблемы

### 1. "ECONNREFUSED 127.0.0.1:54321"

**Причина:** Supabase не запущен локально.

**Решение:**
```bash
supabase start
```

Или используй продакшн URL в `.env`.

### 2. Alt-тексты не генерируются

**Причина:** Отсутствуют связи в БД.

**Решение:** Проверь, что в БД есть:
- `products.brand_id` → `brands.id`
- `products.product_line_id` → `product_lines.id`

### 3. Alt-тексты пустые в браузере

**Причина:** Props не передаются в компонент.

**Решение:** Проверь передачу props:
```vue
<ProductGallery
  :product-name="product.name"
  :brand-name="product.brands?.name"
  :line-name="product.product_lines?.name"
/>
```

### 4. Скрипт не находит переменные окружения

**Причина:** Неправильные имена переменных.

**Решение:** Используй один из вариантов:
```bash
# .env
SUPABASE_URL=...
SUPABASE_KEY=...

# или
NUXT_PUBLIC_SUPABASE_URL=...
NUXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Дальнейшие улучшения

### 1. Добавить категорию в alt-текст

```typescript
// Пример: "LEGO Конструктор Железный Человек Marvel для детей 6+ купить"
if (product.category?.name) {
  parts.push(product.category.name)
}
```

### 2. Мультиязычность

Генерация alt-текстов на казахском языке:

```typescript
const locale = useI18n().locale.value

if (locale === 'kk') {
  context = 'Қазақстаннан сатып алу'
} else {
  context = 'купить в Казахстане'
}
```

### 3. Автоматизация

Database trigger для автоматической генерации при загрузке новых товаров:

```sql
CREATE OR REPLACE FUNCTION generate_image_alt_text()
RETURNS TRIGGER AS $$
BEGIN
  -- Генерация alt_text при вставке нового изображения
  NEW.alt_text := (
    SELECT CONCAT(
      COALESCE(b.name || ' ', ''),
      p.name,
      COALESCE(' ' || pl.name, ''),
      ' купить в Казахстане'
    )
    FROM products p
    LEFT JOIN brands b ON p.brand_id = b.id
    LEFT JOIN product_lines pl ON p.product_line_id = pl.id
    WHERE p.id = NEW.product_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_alt_text
BEFORE INSERT ON product_images
FOR EACH ROW
EXECUTE FUNCTION generate_image_alt_text();
```

### 4. A/B тестирование

Отслеживание, какие формулировки приносят больше трафика:

```typescript
// Вариант A: "купить в Казахстане"
// Вариант B: "цена в Казахстане"
// Вариант C: "заказать в Казахстане"
```

---

## Команды

```bash
# Аудит alt-текстов
npm run seo:audit

# Генерация alt-текстов
npm run seo:generate

# Разработка
npm run dev

# Продакшн билд
npm run build
```

---

## Поддержка

### Документация
- [IMAGE_SEO.md](./IMAGE_SEO.md) - полная документация
- [IMAGE_SEO_QUICKSTART.md](./IMAGE_SEO_QUICKSTART.md) - быстрый старт
- [IMAGE_SEO_CHECKLIST.md](./IMAGE_SEO_CHECKLIST.md) - чеклист внедрения
- [IMAGE_SEO_FINAL_CHECKLIST.md](./IMAGE_SEO_FINAL_CHECKLIST.md) - финальный чеклист

### Файлы
- `composables/useSeoAltText.ts` - composable
- `scripts/generate-alt-texts.ts` - скрипт генерации
- `scripts/audit-alt-texts.ts` - скрипт аудита
- `components/global/ProductCard.vue` - карточки товаров
- `components/global/ProductGallery.vue` - галерея товара

---

## Готово! 🚀

Твои изображения теперь работают на тебя в Google Images!

**Создано:** 2026-04-09  
**Версия:** 1.0
