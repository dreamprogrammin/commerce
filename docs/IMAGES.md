# 🖼️ Система оптимизации изображений

Централизованная система управления изображениями с поддержкой трансформации через Supabase Image Transformation API.

## 📍 Расположение

```
composables/menuItems/useSupabaseStorage.ts  # Основная логика
config/images.ts                              # Конфигурация и пресеты
```

## 🎯 Основная концепция

Система позволяет:

- ✅ **Автоматическая оптимизация** - WebP формат, сжатие до ≤800KB/1440px через browser-image-compression
- ✅ **Один переключатель** - включение/отключение оптимизации глобально
- ✅ **Предустановленные размеры** - консистентные размеры по всему проекту
- ✅ **Экономия трафика** - до 80% меньше размер файлов
- ✅ **Fallback на оригиналы** - при отключении оптимизации или ошибках
- ✅ **Полноэкранная галерея (Lightbox)** - просмотр HD-фото в полноэкранном режиме по клику

---

## 🎛️ Главный переключатель

### Включение/отключение оптимизации

```typescript
// config/images.ts
export const IMAGE_OPTIMIZATION_ENABLED = true // ✅ Оптимизация включена
export const IMAGE_OPTIMIZATION_ENABLED = false // ⚠️ Оптимизация отключена
```

### Когда отключать оптимизацию?

- 💰 **Закончился бюджет** на Supabase Image Transformation
- 🐛 **Отладка** - сравнение оригиналов vs оптимизированных
- ⚡ **Проблемы с производительностью** API
- 🔄 **Миграция** на другой сервис оптимизации

---

## 📖 API Reference

### `useSupabaseStorage()`

Композабл для работы с хранилищем Supabase.

#### Методы

| Метод                 | Описание                                        | Использование                  |
| --------------------- | ----------------------------------------------- | ------------------------------ |
| `getPublicUrl()`      | Возвращает оригинальный URL                     | Когда нужен оригинал           |
| `getOptimizedUrl()`   | Всегда оптимизирует (игнорирует флаг)           | Принудительная оптимизация     |
| `getImageUrl()`       | Умная функция с учетом флага                    | Legacy — старые изображения    |
| `getVariantUrl()`     | **Рекомендуется!** URL варианта (sm/md/lg)      | Товары, бренды, категории      |
| `getVariantUrlWide()` | URL широкого варианта (sm/md/lg)                | Баннеры, слайды                |
| `uploadFile()`        | Загрузка файла в бакет                          | Админ-панель, формы            |
| `removeFile()`        | Удаление файла из бакета                        | Удаление изображений           |

---

## 🎨 Предустановленные размеры

### Все доступные пресеты

```typescript
// config/images.ts
export const IMAGE_SIZES = {
  // Карточки товаров
  PRODUCT_CARD: {
    width: 400,
    height: 400,
    quality: 80,
    format: 'webp',
    resize: 'contain',
  },

  // Галерея товара (главное изображение)
  PRODUCT_GALLERY_MAIN: {
    width: 800,
    height: 800,
    quality: 85,
    format: 'webp',
    resize: 'contain',
  },

  // Миниатюры галереи
  PRODUCT_GALLERY_THUMB: {
    width: 150,
    height: 150,
    quality: 80,
    format: 'webp',
    resize: 'cover',
  },

  // Слайдер на главной
  SLIDER_BANNER: {
    width: 1920,
    height: 800,
    quality: 85,
    format: 'webp',
    resize: 'cover',
  },

  // Категории
  CATEGORY_IMAGE: {
    width: 300,
    height: 200,
    quality: 85,
    format: 'webp',
    resize: 'cover',
  },

  // Логотипы брендов
  BRAND_LOGO: {
    width: 300,
    height: 150,
    quality: 90,
    format: 'webp',
    resize: 'contain',
  },

  // Аксессуары (маленькие превью)
  ACCESSORY_THUMB: {
    width: 80,
    height: 80,
    quality: 75,
    format: 'webp',
    resize: 'cover',
  },

  // Миниатюры для списков
  THUMBNAIL: {
    width: 100,
    height: 100,
    quality: 75,
    format: 'webp',
    resize: 'cover',
  },
}
```

---

## 💡 Примеры использования

### 1️⃣ Базовое использование (рекомендуется)

```vue
<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const { getImageUrl } = useSupabaseStorage()

// Используем пресет из конфига
const imageUrl = computed(() => {
  return getImageUrl(
    BUCKET_NAME_PRODUCT,
    product.value.image_url,
    IMAGE_SIZES.PRODUCT_CARD
  )
})
</script>

<template>
  <img
    :src="imageUrl || '/placeholder.svg'"
    :alt="product.name"
    loading="lazy"
  >
</template>
```

**Результат:**

- ✅ Если `IMAGE_OPTIMIZATION_ENABLED = true` → оптимизированное изображение
- ✅ Если `IMAGE_OPTIMIZATION_ENABLED = false` → оригинальное изображение

---

### 2️⃣ Кастомные параметры

Если нужны уникальные параметры, не добавленные в пресеты:

```vue
<script setup lang="ts">
const { getImageUrl } = useSupabaseStorage()

const customImageUrl = computed(() => {
  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl.value, {
    width: 350,
    height: 250,
    quality: 90,
    format: 'webp',
    resize: 'cover',
  })
})
</script>
```

---

### 3️⃣ Принудительная оптимизация

Если нужно **всегда** оптимизировать (игнорируя глобальный флаг):

```vue
<script setup lang="ts">
const { getOptimizedUrl } = useSupabaseStorage()

// Всегда оптимизирует, даже если IMAGE_OPTIMIZATION_ENABLED = false
const alwaysOptimized = computed(() => {
  return getOptimizedUrl(BUCKET_NAME_PRODUCT, imageUrl.value, {
    width: 400,
    quality: 80,
    format: 'webp',
  })
})
</script>
```

⚠️ **Используйте редко!** Обычно достаточно `getImageUrl()`.

---

### 4️⃣ Оригинальное изображение

Когда нужен оригинал без оптимизации:

```vue
<script setup lang="ts">
const { getPublicUrl } = useSupabaseStorage()

// Всегда возвращает оригинальный URL
const originalUrl = computed(() => {
  return getPublicUrl(BUCKET_NAME_PRODUCT, imageUrl.value)
})
</script>
```

**Использование:**

- Загрузка файлов для скачивания
- Превью в полном размере
- Печать высокого качества

---

### 5️⃣ Функция-хелпер в компоненте

```vue
<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'

const { getImageUrl } = useSupabaseStorage()

// Создаем функцию-обертку
function getCategoryImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return '/images/placeholder.svg'

  return getImageUrl(BUCKET_NAME_CATEGORY, imageUrl, IMAGE_SIZES.CATEGORY_IMAGE)
    || '/images/placeholder.svg'
}
</script>

<template>
  <img
    v-for="category in categories"
    :key="category.id"
    :src="getCategoryImageUrl(category.image_url)"
    :alt="category.name"
  >
</template>
```

---

## 🔧 Параметры трансформации

### Доступные опции

```typescript
interface ImageTransformOptions {
  width?: number // Ширина в пикселях
  height?: number // Высота в пикселях
  quality?: number // Качество 1-100 (по умолчанию 80)
  format?: 'webp' | 'avif' | 'jpeg' | 'png' // Формат (по умолчанию 'webp')
  resize?: 'cover' | 'contain' | 'fill' // Режим изменения размера
}
```

### Режимы `resize`

| Режим     | Описание                          | Когда использовать                     |
| --------- | --------------------------------- | -------------------------------------- |
| `cover`   | Заполняет область, обрезая лишнее | Карточки, баннеры, миниатюры           |
| `contain` | Вписывает изображение целиком     | Логотипы, товары (сохраняет пропорции) |
| `fill`    | Растягивает до заданных размеров  | Редко (искажает изображение)           |

### Визуальное сравнение

```
Оригинал: 1200x800 → Целевой размер: 400x400

cover (обрезает):
┌────────────┐
│  ┌──────┐  │
│  │ IMG  │  │
│  └──────┘  │
└────────────┘

contain (вписывает):
┌────────────┐
│            │
│ ┌────────┐ │
│ │  IMG   │ │
│ └────────┘ │
│            │
└────────────┘
```

---

## 📊 Производительность

### Экономия трафика

| Оригинал                 | Оптимизировано         | Экономия |
| ------------------------ | ---------------------- | -------- |
| 2.5 MB (JPEG, 4000x3000) | 180 KB (WebP, 800x800) | **93%**  |
| 1.2 MB (PNG, 2000x2000)  | 95 KB (WebP, 400x400)  | **92%**  |
| 450 KB (JPEG, 1920x1080) | 85 KB (WebP, 1920x800) | **81%**  |

### Рекомендации по качеству

| Тип изображения     | Рекомендуемое качество |
| ------------------- | ---------------------- |
| Карточки товаров    | 75-85%                 |
| Баннеры/слайдеры    | 85-90%                 |
| Миниатюры           | 70-80%                 |
| Логотипы            | 85-95%                 |
| Фоновые изображения | 70-80%                 |

---

## 🏗️ Архитектура

### Как это работает

```
┌─────────────────────────────────────────────────────────┐
│  Component                                              │
│  ┌──────────────────────────────────────────────────┐  │
│  │ getImageUrl(bucket, path, IMAGE_SIZES.PRODUCT)   │  │
│  └────────────────────┬─────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  useSupabaseStorage                                     │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Проверяет IMAGE_OPTIMIZATION_ENABLED             │  │
│  └────────────────────┬─────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────┘
                        │
           ┌────────────┴────────────┐
           │                         │
           ▼                         ▼
    ┌─────────────┐          ┌─────────────┐
    │ Оптимизация │          │  Оригинал   │
    │   включена  │          │  отключена  │
    └──────┬──────┘          └──────┬──────┘
           │                         │
           ▼                         ▼
  getOptimizedUrl()           getPublicUrl()
           │                         │
           ▼                         ▼
/storage/v1/render/image/   /storage/v1/object/
public/products/img.jpg?    public/products/
width=400&quality=80&       img.jpg
format=webp
```

---

## 🚀 Best Practices

### ✅ DO (Правильно)

```vue
<script setup>
import { IMAGE_SIZES } from '@/config/images'

// 1. Используйте getImageUrl (не getOptimizedUrl)
const { getImageUrl } = useSupabaseStorage()

// 2. Используйте пресеты из IMAGE_SIZES
const url = getImageUrl(bucket, path, IMAGE_SIZES.PRODUCT_CARD)

// 3. Добавляйте fallback
const imageUrl = computed(() =>
  getImageUrl(bucket, path, IMAGE_SIZES.PRODUCT_CARD) || '/placeholder.svg'
)

// 4. Используйте loading="lazy" для изображений ниже fold
</script>

<template>
  <img :src="imageUrl" alt="..." loading="lazy">
</template>
```

### ❌ DON'T (Неправильно)

```vue
<script setup>
// ❌ Не используйте getOptimizedUrl напрямую (игнорирует флаг)
const { getOptimizedUrl } = useSupabaseStorage()

// ❌ Не хардкодьте параметры
const url = getImageUrl(bucket, path, {
  width: 400,
  height: 400,
  quality: 80,
  format: 'webp',
})

// ❌ Не забывайте про fallback
const url = getImageUrl(bucket, path, IMAGE_SIZES.PRODUCT_CARD)
// Что если вернется null?
</script>

<template>
  <!-- ❌ Не используйте NuxtImg с provider="supabase" -->
  <NuxtImg :src="url" provider="supabase" />

  <!-- ❌ Не ставьте loading="eager" везде -->
  <img :src="url" loading="eager">
</template>
```

---

## 🔄 Миграция с других подходов

### С `NuxtImg` на нашу систему

```vue
<!-- ❌ Было -->
<NuxtImg
  :src="getPublicUrl(bucket, path)"
  provider="supabase"
  format="webp"
  quality="80"
  width="400"
  height="400"
/>

<!-- ✅ Стало -->
<script setup>
const imageUrl = computed(() =>
  getImageUrl(bucket, path, IMAGE_SIZES.PRODUCT_CARD)
)
</script>

<template>
  <img :src="imageUrl" alt="..." loading="lazy">
</template>
```

### С `getPublicUrl` на `getImageUrl`

```vue
<!-- ❌ Было -->
<script setup>
const { getPublicUrl } = useSupabaseStorage()
const url = getPublicUrl(bucket, path)
</script>

<!-- ✅ Стало -->
<script setup>
const { getImageUrl } = useSupabaseStorage()
const url = getImageUrl(bucket, path, IMAGE_SIZES.PRODUCT_CARD)
</script>
```

---

## 📝 Добавление нового пресета

### Шаг 1: Добавить в конфиг

```typescript
// config/images.ts
export const IMAGE_SIZES = {
  // ... существующие пресеты

  // Новый пресет
  HERO_BANNER: {
    width: 2560,
    height: 1440,
    quality: 90,
    format: 'webp',
    resize: 'cover',
  },
} as const
```

### Шаг 2: Использовать в компоненте

```vue
<script setup>
import { IMAGE_SIZES } from '@/config/images'

const bannerUrl = getImageUrl(
  BUCKET_NAME_HERO,
  hero.image_url,
  IMAGE_SIZES.HERO_BANNER
)
</script>
```

### Шаг 3: Обновить документацию

Добавьте описание нового пресета в раздел "Предустановленные размеры".

---

## 🐛 Troubleshooting

### Изображения не оптимизируются

**Симптомы:**

- Загружаются оригинальные файлы (большой размер)
- URL не содержит параметры `?width=...&quality=...`

**Решение:**

```typescript
// Проверьте config/images.ts
export const IMAGE_OPTIMIZATION_ENABLED = true // ✅ Должно быть true

// Проверьте, что используете getImageUrl (не getPublicUrl)
const { getImageUrl } = useSupabaseStorage() // ✅
```

---

### Ошибка 404 на оптимизированных URL

**Симптомы:**

- Консоль показывает 404 на URL вида `/storage/v1/render/image/...`

**Возможные причины:**

1. Image Transformation API не включен в Supabase проекте
2. Неправильное название бакета
3. Файл действительно не существует

**Решение:**

```typescript
// 1. Проверьте бакет
console.log('Bucket:', BUCKET_NAME_PRODUCT) // Должно совпадать с Supabase

// 2. Проверьте путь к файлу
console.log('Path:', product.image_url) // Не должно быть полного URL

// 3. Временно отключите оптимизацию для проверки
export const IMAGE_OPTIMIZATION_ENABLED = false
```

---

### Изображения искажены

**Симптомы:**

- Изображение растянуто или сжато

**Решение:**

```typescript
// Используйте правильный режим resize

// ❌ Неправильно (растягивает)
resize: 'fill'

// ✅ Правильно (сохраняет пропорции)
resize: 'contain' // Для логотипов, товаров
resize: 'cover' // Для карточек, баннеров
```

---

### Низкое качество изображений

**Симптомы:**

- Изображения выглядят размыто или с артефактами

**Решение:**

```typescript
// Увеличьте качество в пресете
PRODUCT_CARD: {
  width: 400,
  height: 400,
  quality: 85, // Было 80, увеличили до 85
  format: 'webp',
  resize: 'contain',
}
```

**Рекомендации по качеству:**

- Товары, логотипы: 80-90%
- Баннеры: 85-95%
- Миниатюры: 70-80%

---

## 💰 Стоимость и лимиты

### Supabase Image Transformation

- **Free Plan**: 5 GB трансформаций/месяц
- **Pro Plan**: 50 GB трансформаций/месяц
- **Дополнительно**: $0.10/GB

### Оптимизация расходов

1. **Используйте разумные размеры**

   ```typescript
   // ❌ Слишком большое (зря тратит лимиты)
   width: 4000, height: 4000

   // ✅ Оптимально
   width: 800, height: 800
   ```

2. **Кэшируйте трансформации**
   - Supabase кэширует результаты автоматически
   - Повторные запросы не тратят лимиты

3. **Мониторьте использование**
   - Supabase Dashboard → Settings → Usage

4. **План Б: отключите оптимизацию**
   ```typescript
   export const IMAGE_OPTIMIZATION_ENABLED = false
   ```

---

## 📊 Мониторинг

### Проверка статуса оптимизации

```typescript
// В консоли браузера появится сообщение:
// 🎨 Image Optimization: ✅ Enabled
// или
// 🎨 Image Optimization: ⚠️ Disabled (using original URLs)
```

### Добавить в Nuxt plugin

```typescript
// plugins/image-optimization.client.ts
import { logOptimizationStatus } from '@/config/images'

export default defineNuxtPlugin(() => {
  logOptimizationStatus()
})
```

---

## 🔍 Полноэкранная галерея (Lightbox)

### Описание

Компонент `ProductGallery.vue` поддерживает полноэкранный просмотр изображений по клику.
Реализовано на базе `Dialog` (shadcn-ui) + `Carousel` (Embla) — без сторонних библиотек.

### Функционал

- **Триггер**: клик по основному изображению в слайдере (`cursor-zoom-in`)
- **Темный overlay** (`bg-black/95`)
- **Кнопка закрытия** (X, правый верхний угол)
- **HD-изображения** — используется пресет `IMAGE_SIZES.LARGE` (1200x1200) для максимальной четкости
- **Навигация**: стрелки ← → + свайпы (Embla) + клавиатура (ArrowLeft / ArrowRight)
- **Синхронизация**: при открытии показывает тот слайд, на который кликнул пользователь
- **Счетчик**: «2 / 5» в левом верхнем углу
- **Доступность**: `sr-only` DialogTitle, aria-labels на кнопках

### Архитектура

```
Клик по фото → isLightboxOpen = true
                    ↓
         Dialog (fullscreen, bg-black/95)
                    ↓
         Carousel (loop, startIndex = currentSlide)
                    ↓
         img src = getFullUrl() → IMAGE_SIZES.LARGE (1200×1200)
```

### Пример расширения

Чтобы добавить зум внутри лайтбокса, можно обернуть `<img>` в pinch-to-zoom библиотеку
или реализовать CSS `transform: scale()` по двойному клику.

---

## 🔗 Связанные файлы

- `composables/menuItems/useSupabaseStorage.ts` - Основной композабл (`getImageUrl`, `getVariantUrl`)
- `composables/useProductGallery.ts` - Логика синхронизации каруселей (main + thumb)
- `config/images.ts` - Конфигурация, пресеты, `IMAGE_VARIANTS`
- `utils/imageOptimizer.ts` - Клиентская оптимизация, `generateImageVariants()`
- `constants/index.ts` - Названия бакетов
- `components/global/ProgressiveImage.vue` - Базовый компонент с srcset
- `components/global/ProductGallery.vue` - Галерея товара с Lightbox
- `components/global/ProductCard.vue` - Карточка товара с адаптивными изображениями
- `stores/adminStore/adminProductsStore.ts` - Загрузка вариантов при создании/обновлении товара
- `components/home/PopularCategories.vue` - Пример с категориями

---

## 📚 Дополнительные ресурсы

- [Supabase Image Transformation Docs](https://supabase.com/docs/guides/storage/image-transformations)
- [WebP Format Guide](https://developers.google.com/speed/webp)
- [Image Optimization Best Practices](https://web.dev/fast/#optimize-your-images)

---

## 📐 Адаптивные изображения (srcset) — v4.0.0

### Концепция

При загрузке товара генерируются **3 варианта** каждого изображения:

| Вариант | Размер | Качество | maxSizeMB | Суффикс | Использование |
|---------|--------|----------|-----------|---------|---------------|
| `sm` | 400px | 75% | 0.05 (50KB) | `_sm` | Карточки на мобильных |
| `md` | 800px | 80% | 0.15 (150KB) | `_md` | Карточки на десктопе, галерея |
| `lg` | 1440px | 90% | 0.8 (800KB) | `_lg` | Lightbox, зум |

Браузер автоматически выбирает оптимальный размер через HTML `srcset`.

### Хранение в БД

**Новые изображения:** `product_images.image_url` хранит **базовый путь без расширения**:
```
products/abc-123/uhti-product-name-def456
```

В Supabase Storage лежат 3 файла:
```
products/abc-123/uhti-product-name-def456_sm.webp  (~20-50KB)
products/abc-123/uhti-product-name-def456_md.webp  (~100-150KB)
products/abc-123/uhti-product-name-def456_lg.webp  (~300-800KB)
```

**Старые изображения:** путь с расширением (`.webp`, `.jpg`) — работают как раньше (fallback).

### Конфигурация

```typescript
// config/images.ts
export const IMAGE_VARIANTS = {
  sm: { maxWidthOrHeight: 400, quality: 0.75, suffix: '_sm' },
  md: { maxWidthOrHeight: 800, quality: 0.80, suffix: '_md' },
  lg: { maxWidthOrHeight: 1440, quality: 0.90, suffix: '_lg' },
} as const

export type ImageVariant = keyof typeof IMAGE_VARIANTS  // 'sm' | 'md' | 'lg'
```

### API

#### `getVariantUrl(bucket, basePath, variant)`

Возвращает URL конкретного варианта с обратной совместимостью:

```typescript
const { getVariantUrl } = useSupabaseStorage()

// Новое фото (без расширения) → подставляет суффикс
getVariantUrl('product-images', 'products/123/uhti-toy-abc', 'sm')
// → .../products/123/uhti-toy-abc_sm.webp

// Старое фото (с расширением) → возвращает как есть
getVariantUrl('product-images', 'products/123/uhti-toy-abc.webp', 'sm')
// → .../products/123/uhti-toy-abc.webp
```

#### `generateImageVariants(file)`

Генерирует 3 варианта + LQIP параллельно (на клиенте, при загрузке):

```typescript
import { generateImageVariants } from '@/utils/imageOptimizer'

const result = await generateImageVariants(file)
// result.sm  → File (400px, ~50KB)
// result.md  → File (800px, ~150KB)
// result.lg  → File (1440px, ~800KB)
// result.blurPlaceholder → base64 data URL
```

### Использование в компонентах

#### ProgressiveImage (srcset)

```vue
<ProgressiveImage
  :src="getVariantUrl(BUCKET, imageUrl, 'sm')"
  :src-sm="getVariantUrl(BUCKET, imageUrl, 'sm')"
  :src-md="getVariantUrl(BUCKET, imageUrl, 'md')"
  :src-lg="getVariantUrl(BUCKET, imageUrl, 'lg')"
  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
  :blur-data-url="image.blur_placeholder"
  alt="Товар"
/>
```

Если `srcSm`/`srcMd`/`srcLg` не переданы — поведение не меняется (обратная совместимость).

#### ProductGallery (контекстные варианты)

| Контекст | Вариант | Почему |
|----------|---------|--------|
| Миниатюры (120px) | `sm` (400px) | Достаточно для мелких превью |
| Основное изображение | `md` (800px) | Оптимально для ~600px контейнера |
| Lightbox (fullscreen) | `lg` (1440px) | HD-качество для зума |

### Обратная совместимость

Детекция старых/новых фото происходит автоматически:

```typescript
// Старое фото: image_url содержит расширение → /\.\w{3,4}$/.test(path)
"products/123/uhti-toy-abc.webp"  → используем URL как есть

// Новое фото: image_url без расширения
"products/123/uhti-toy-abc"  → подставляем _sm.webp / _md.webp / _lg.webp
```

### Удаление изображений

При удалении товара или отдельного изображения автоматически удаляются все 3 варианта из Storage.

### Платный тариф

При `IMAGE_OPTIMIZATION_ENABLED = true` варианты не используются — Supabase Transform API трансформирует на лету. `getVariantUrl()` в этом режиме вызывает `getOptimizedUrl()` с соответствующими размерами.

---

## 🎠 Слайды — двойная загрузка изображений (Desktop + Mobile)

### Концепция

Каждый слайд на главной странице имеет **два изображения**:

| Поле | Пропорции | Назначение |
|------|-----------|------------|
| `image_url` | 21:9 | Десктопная версия (широкий баннер) |
| `image_url_mobile` | 3:2 | Мобильная версия (компактная) |

Оба изображения генерируются в 3 широких варианта через `IMAGE_VARIANTS_WIDE` (640/1280/1920px).

### Архитектура

```
┌──────────────────────────────────────────────────────┐
│  SlidesForm.vue (UI)                                 │
│  ├── input[file] для desktop → handleImageChange()   │
│  └── input[file] для mobile  → handleImageChangeMobile()
└──────────────────┬───────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│  useSlideForm.ts (Composable)                        │
│                                                      │
│  Состояние:                                          │
│  ├── newImageFile        / imageToDelete       (desktop)
│  └── newImageFileMobile  / imageToDeleteMobile (mobile)
│                                                      │
│  handleSubmit():                                     │
│  ├── _uploadWideVariants(desktopFile, "slide-{title}")
│  │   └── generateImageVariantsWide() → 3 файла       │
│  ├── _uploadWideVariants(mobileFile, "slide-mobile-{title}")
│  │   └── generateImageVariantsWide() → 3 файла       │
│  └── supabase.from('slides').insert/update(...)      │
└──────────────────────────────────────────────────────┘
```

### Именование файлов (ID-based)

Файлы слайдов именуются по UUID записи (не по заголовку):
- Desktop: `slide-{slideId}` → `slide-{slideId}_sm.webp`, `_md.webp`, `_lg.webp`
- Mobile: `slide-mobile-{slideId}` → `slide-mobile-{slideId}_sm.webp`, `_md.webp`, `_lg.webp`

Для новых слайдов используется **insert-first flow**: сначала создаётся запись в БД (без изображений), получаем UUID, загружаем файлы с этим ID, затем UPDATE.

### Хранение в Supabase Storage (`slides-images`)

```
slides-images/
├── slide-a1b2c3d4_sm.webp           (desktop, 640px)
├── slide-a1b2c3d4_md.webp           (desktop, 1280px)
├── slide-a1b2c3d4_lg.webp           (desktop, 1920px)
├── slide-mobile-a1b2c3d4_sm.webp    (mobile, 640px)
├── slide-mobile-a1b2c3d4_md.webp    (mobile, 1280px)
└── slide-mobile-a1b2c3d4_lg.webp    (mobile, 1920px)
```

### Хранение в БД (`slides`)

| Поле | Значение | Описание |
|------|----------|----------|
| `image_url` | `slide-a1b2c3d4` | Базовый путь desktop (без суффикса) |
| `blur_placeholder` | `data:image/webp;base64,...` | LQIP для desktop |
| `image_url_mobile` | `slide-mobile-a1b2c3d4` | Базовый путь mobile (без суффикса), `null` если не загружено |
| `blur_placeholder_mobile` | `data:image/webp;base64,...` | LQIP для mobile |

### Art Direction (`AppCarousel.vue`)

Компонент использует нативный `<picture>` с `<source media="...">` для автоматического переключения изображений:

```html
<picture>
  <!-- Mobile: < 768px -->
  <source media="(max-width: 767px)" :srcset="slide.mobileSrcset" sizes="100vw" />
  <!-- Desktop (default) -->
  <img :src="slide.desktopUrl" :srcset="slide.desktopSrcset" sizes="(max-width: 1024px) 85vw, 80vw" />
</picture>
```

**Srcset для каждого изображения**: `640w` (sm), `1280w` (md), `1920w` (lg) — браузер выбирает оптимальный вариант.

### Fallback логика

- Если `image_url_mobile = null`, `<source>` для мобильных использует desktop srcset — браузер автоматически подберёт нужный размер
- LQIP blur placeholder отображается поверх `<picture>` до загрузки изображения

### Удаление

При удалении слайда (`useAdminSlides.handleDelete()`) автоматически удаляются **все 6 файлов** (3 desktop + 3 mobile) через `_getVariantPaths()`.

### Файлы

| Файл | Роль |
|------|------|
| `components/admin/slides/ SlidesForm.vue` | UI формы с двумя input[file] |
| `composables/admin/useSlideForm.ts` | Логика загрузки, валидации, сохранения |
| `composables/admin/useAdminSlides.ts` | Список слайдов + удаление с очисткой Storage |
| `components/common/AppCarousel.vue` | Карусель на главной (desktop/mobile switching) |

---

## 📝 Changelog

### v4.1.0 (Current) — Глобальная стандартизация

Система адаптивных изображений распространена на **все сущности** проекта.

**Новые конфигурации:**
- `IMAGE_VARIANTS_WIDE` — широкие варианты (640/1280/1920px) для баннеров и слайдов
- `generateImageVariantsWide()` — генерация широких вариантов
- `getVariantUrlWide()` — URL-хелпер для широких вариантов

**Stores — загрузка 3 вариантов при создании/обновлении:**

| Store | Бакет | Тип вариантов |
|-------|-------|---------------|
| `adminProductsStore` | product-images | Standard (400/800/1440px) |
| `adminBrandsStore` | brand-logos | Standard |
| `adminProductLinesStore` | product-line-logos | Standard |
| `adminCategoriesStore` | category-images | Standard |
| `useSlideForm` | slides-images | Wide (640/1280/1920px) |
| `useBannerForm` | banners | Wide |

**Удаление всех вариантов при удалении сущности:**
- `adminBrandsStore.deleteBrand()` — удаляет 3 файла логотипа
- `adminProductLinesStore.deleteProductLine()` — удаляет 3 файла
- `adminCategoriesStore.saveChanges()` — удаляет варианты при удалении/замене
- `useAdminSlides.handleDelete()` — удаляет варианты desktop + mobile
- `useAdminBanners.handleDelete()` — **исправлен баг**: ранее файлы не удалялись из Storage

**Фронтенд — все компоненты используют `getVariantUrl`/`getVariantUrlWide`:**
- Категории: `PopularCategories`, `AppTabBar`, `CategoryDescription`, каталог
- Бренды: `BrandsCarousel`, `ProductCard` (лого), `/brands`, `/brand/[slug]`
- Линейки: `CategoryProductLines`, `/brand/[brandSlug]/[lineSlug]`
- Слайды: `AppCarousel` → `getVariantUrlWide('lg'/'sm')`
- Баннеры: `Banners.vue` → `getVariantUrlWide('md')`

**Админ-панель — превью через варианты:**
- `BrandForm`, `ProductLineForm`, `RecursiveMenuItemFormNode` → `getVariantUrl('sm')`
- `SlidesForm`, `BannerForm` → `getVariantUrlWide('sm'/'lg')`
- Все формы имеют `@error` fallback на placeholder.svg

### v4.0.0

- Адаптивные изображения: 3 варианта (sm/md/lg) при загрузке товара
- HTML `srcset` + `sizes` в `ProgressiveImage.vue` для автоматического выбора размера
- `getVariantUrl()` хелпер с обратной совместимостью для старых изображений
- `generateImageVariants()` — параллельная генерация 3 WebP + LQIP
- `ProductCard.vue` и `ProductGallery.vue` используют варианты
- Удаление товара удаляет все 3 файла из Storage
- Fallback: при ошибке генерации вариантов загружается один файл как раньше

### v3.1.0

- ✅ Улучшено качество сжатия: `maxSizeMB` 0.15 → 0.8, `maxWidthOrHeight` 1200 → 1440, `initialQuality: 0.85`
- ✅ `PRODUCT_GALLERY_MAIN` увеличен с 800×800 до 1200×1200 для четкости на десктопе
- ✅ `IMAGE_SIZES.LARGE` увеличен до 1440×1440 с quality 95 для Lightbox
- ✅ Полноэкранная галерея (Lightbox) на базе Dialog + Carousel (без сторонних библиотек)
- ✅ Навигация: стрелки, свайпы, клавиатура, синхронизация с основным слайдером

### v3.0.0

- ✅ Клиентская оптимизация при загрузке (browser-image-compression)
- ✅ LQIP blur placeholder генерация
- ✅ Пакетная оптимизация `optimizeImagesBatch()`

### v2.0.0

- ✅ Добавлена функция `getImageUrl()` с поддержкой глобального флага
- ✅ Конфиг `IMAGE_OPTIMIZATION_ENABLED` для быстрого переключения
- ✅ Предустановленные размеры `IMAGE_SIZES`
- ✅ Fallback на оригиналы при ошибках
- ✅ TypeScript типы для всех параметров

### v1.0.0 (Legacy)

- `getPublicUrl()` - только оригинальные URL
- `getOptimizedUrl()` - ручная оптимизация

---

**Автор:** Development Team
**Последнее обновление:** 2026-03-03
**Версия:** 4.1.0

---

## 🔄 Клиентская оптимизация при загрузке

На бесплатном тарифе (`IMAGE_OPTIMIZATION_ENABLED = false`) Supabase Image Transformation API не используется.
Вместо этого изображения сжимаются в браузере администратора перед загрузкой в Supabase Storage.

### Как работает `utils/imageOptimizer.ts`

**v4.0.0 (товары):** При загрузке товара вызывается `generateImageVariants(file)`, который параллельно генерирует 3 WebP-файла + LQIP:

```typescript
// generateImageVariants: параллельно (Promise.all)
// 1. sm: maxSizeMB=0.05, maxWidthOrHeight=400, quality=0.75, fileType='image/webp'
// 2. md: maxSizeMB=0.15, maxWidthOrHeight=800, quality=0.80, fileType='image/webp'
// 3. lg: maxSizeMB=0.8, maxWidthOrHeight=1440, quality=0.90, fileType='image/webp'
// 4. LQIP: maxSizeMB=0.002, maxWidthOrHeight=20
```

**v4.1.0 (все сущности):** Все сущности используют варианты:
- Бренды, линейки, категории → `generateImageVariants()` (Standard: 400/800/1440px)
- Слайды, баннеры → `generateImageVariantsWide()` (Wide: 640/1280/1920px)

### Параметры сжатия (стандартные варианты)

| Вариант | maxSizeMB | maxWidthOrHeight | quality | Типичный размер |
|---------|-----------|------------------|---------|----------------|
| `sm` | 0.05 | 400px | 75% | 20-50 KB |
| `md` | 0.15 | 800px | 80% | 80-150 KB |
| `lg` | 0.8 | 1440px | 90% | 300-800 KB |
| LQIP | 0.002 | 20px | — | ~0.5 KB |

### Параметры сжатия (широкие варианты — баннеры/слайды)

| Вариант | maxSizeMB | maxWidthOrHeight | quality | Типичный размер |
|---------|-----------|------------------|---------|----------------|
| `sm` | 0.1 | 640px | 75% | 50-100 KB |
| `md` | 0.3 | 1280px | 80% | 150-300 KB |
| `lg` | 1.0 | 1920px | 90% | 400-1000 KB |

### Параметры сжатия (одиночное, legacy)

| Параметр | Значение | Описание |
|----------|----------|----------|
| `maxSizeMB` | 0.8 | Максимум 800KB (HD-качество) |
| `maxWidthOrHeight` | 1440 | Максимум 1440px по длинной стороне |
| `initialQuality` | 0.85 | Начальное качество 85% |
| `fileType` | `image/webp` | Всегда конвертируем в WebP |
| LQIP `maxWidthOrHeight` | 20 | Blur placeholder 20px |

### Файлы задействованные в клиентской оптимизации

- `utils/imageOptimizer.ts` — `generateImageVariants()`, `generateImageVariantsWide()`, `optimizeImageBeforeUpload()`
- `stores/adminStore/adminProductsStore.ts` — варианты товарных изображений (Standard)
- `stores/adminStore/adminBrandsStore.ts` — варианты логотипов брендов (Standard)
- `stores/adminStore/adminProductLinesStore.ts` — варианты логотипов линеек (Standard)
- `stores/adminStore/adminCategoriesStore.ts` — варианты изображений категорий (Standard)
- `composables/admin/useSlideForm.ts` — варианты слайдов (Wide)
- `composables/admin/useBannerForm.ts` — варианты баннеров (Wide)
