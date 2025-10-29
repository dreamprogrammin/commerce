# 🖼️ Система оптимизации изображений

Централизованная система управления изображениями с поддержкой трансформации через Supabase Image Transformation API.

## 📍 Расположение

```
composables/menuItems/useSupabaseStorage.ts  # Основная логика
config/images.ts                              # Конфигурация и пресеты
```

## 🎯 Основная концепция

Система позволяет:

- ✅ **Автоматическая оптимизация** - WebP формат, сжатие, изменение размеров
- ✅ **Один переключатель** - включение/отключение оптимизации глобально
- ✅ **Предустановленные размеры** - консистентные размеры по всему проекту
- ✅ **Экономия трафика** - до 80% меньше размер файлов
- ✅ **Fallback на оригиналы** - при отключении оптимизации или ошибках

---

## 🎛️ Главный переключатель

### Включение/отключение оптимизации

```typescript
// config/images.ts
export const IMAGE_OPTIMIZATION_ENABLED = true  // ✅ Оптимизация включена
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

| Метод | Описание | Использование |
|-------|----------|---------------|
| `getPublicUrl()` | Возвращает оригинальный URL | Когда нужен оригинал |
| `getOptimizedUrl()` | Всегда оптимизирует (игнорирует флаг) | Принудительная оптимизация |
| `getImageUrl()` | **Рекомендуется!** Умная функция с учетом флага | 99% случаев |
| `uploadFile()` | Загрузка файла в бакет | Админ-панель, формы |
| `removeFile()` | Удаление файла из бакета | Удаление изображений |

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
  />
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
  if (!imageUrl) return '/images/placeholder.svg'
  
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
  />
</template>
```

---

## 🔧 Параметры трансформации

### Доступные опции

```typescript
interface ImageTransformOptions {
  width?: number        // Ширина в пикселях
  height?: number       // Высота в пикселях
  quality?: number      // Качество 1-100 (по умолчанию 80)
  format?: 'webp' | 'avif' | 'jpeg' | 'png'  // Формат (по умолчанию 'webp')
  resize?: 'cover' | 'contain' | 'fill'      // Режим изменения размера
}
```

### Режимы `resize`

| Режим | Описание | Когда использовать |
|-------|----------|-------------------|
| `cover` | Заполняет область, обрезая лишнее | Карточки, баннеры, миниатюры |
| `contain` | Вписывает изображение целиком | Логотипы, товары (сохраняет пропорции) |
| `fill` | Растягивает до заданных размеров | Редко (искажает изображение) |

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

| Оригинал | Оптимизировано | Экономия |
|----------|----------------|----------|
| 2.5 MB (JPEG, 4000x3000) | 180 KB (WebP, 800x800) | **93%** |
| 1.2 MB (PNG, 2000x2000) | 95 KB (WebP, 400x400) | **92%** |
| 450 KB (JPEG, 1920x1080) | 85 KB (WebP, 1920x800) | **81%** |

### Рекомендации по качеству

| Тип изображения | Рекомендуемое качество |
|-----------------|----------------------|
| Карточки товаров | 75-85% |
| Баннеры/слайдеры | 85-90% |
| Миниатюры | 70-80% |
| Логотипы | 85-95% |
| Фоновые изображения | 70-80% |

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
  <img :src="imageUrl" alt="..." loading="lazy" />
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
  <img :src="url" loading="eager" />
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
  <img :src="imageUrl" alt="..." loading="lazy" />
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
resize: 'contain'  // Для логотипов, товаров
resize: 'cover'    // Для карточек, баннеров
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

## 🔗 Связанные файлы

- `composables/menuItems/useSupabaseStorage.ts` - Основной композабл
- `config/images.ts` - Конфигурация и пресеты
- `constants/index.ts` - Названия бакетов
- `components/global/ProductCard.vue` - Пример использования
- `components/home/PopularCategories.vue` - Пример с категориями

---

## 📚 Дополнительные ресурсы

- [Supabase Image Transformation Docs](https://supabase.com/docs/guides/storage/image-transformations)
- [WebP Format Guide](https://developers.google.com/speed/webp)
- [Image Optimization Best Practices](https://web.dev/fast/#optimize-your-images)

---

## 📝 Changelog

### v2.0.0 (Current)
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
**Последнее обновление:** 2025  
**Версия:** 2.0.0