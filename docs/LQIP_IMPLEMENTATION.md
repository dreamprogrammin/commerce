# 🎨 LQIP (Low-Quality Image Placeholder) - Инструкция по внедрению

## 📋 Что это?

**LQIP** - техника отображения blur preview изображения (как на Medium.com):

1. Показывается крошечное размытое изображение (~2KB) мгновенно
2. Пока загружается полное изображение
3. Плавный переход когда загрузилось

## ✅ Преимущества:

- ✨ **Мгновенный показ** - пользователь сразу видит контент
- 🎨 **Красиво** - профессиональный вид как на Medium/Unsplash
- 📦 **Легковесно** - blur preview всего 1-3 KB
- ⚡ **Быстрая загрузка** - показываем blur, пока грузится полное изображение

---

## 🚀 Шаги внедрения:

### 1️⃣ Обновите БД (добавьте поле blur_placeholder)

Выполните SQL миграцию в Supabase Dashboard → SQL Editor:

```sql
-- Добавляем колонку blur_placeholder
ALTER TABLE product_images
ADD COLUMN IF NOT EXISTS blur_placeholder TEXT NULL;

-- Комментарий
COMMENT ON COLUMN product_images.blur_placeholder IS 'Base64 data URL blur preview для LQIP (~1-3KB)';

-- Индекс
CREATE INDEX IF NOT EXISTS idx_product_images_has_blur
ON product_images (product_id)
WHERE blur_placeholder IS NOT NULL;
```

### 2️⃣ Обновите TypeScript типы

В вашем файле типов (обычно `types/database.ts` или `types/index.ts`):

```typescript
export interface ProductImageRow {
  id: string
  product_id: string
  image_url: string
  display_order: number
  blur_placeholder?: string | null // 🆕 Добавьте это
  created_at: string
  updated_at: string
}
```

Или regenerate types из Supabase:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/database.ts
```

### 3️⃣ Обновите логику сохранения изображений

В вашем store или API handler где сохраняете изображения:

```typescript
// Пример в adminProductsStore или где у вас логика загрузки

async function uploadProductImage(
  productId: string,
  file: File,
  displayOrder: number,
  blurDataUrl?: string // 🆕 Принимаем blur
) {
  // 1. Загружаем файл в Storage
  const filePath = await uploadFile(file, {
    bucketName: 'product-images',
    filePathPrefix: `products/${productId}`,
  })

  // 2. Сохраняем в БД С blur_placeholder
  const { data, error } = await supabase
    .from('product_images')
    .insert({
      product_id: productId,
      image_url: filePath,
      display_order: displayOrder,
      blur_placeholder: blurDataUrl, // 🆕 Сохраняем blur
    })
    .select()
    .single()

  return data
}
```

### 4️⃣ Обновите ProductCard.vue

```vue
<template>
  <!-- Десктоп -->
  <ProgressiveImage
    :src="activeImageUrl"
    :alt="product.name"
    placeholder-type="lqip"
    :blur-data-url="product.product_images?.[activeImageIndex]?.blur_placeholder"
    eager
  />

  <!-- Мобил карусель -->
  <CarouselItem v-for="(image, index) in product.product_images" :key="index">
    <ProgressiveImage
      :src="getImageUrlByIndex(index)"
      :alt="`${product.name} - ${index + 1}`"
      placeholder-type="lqip"
      :blur-data-url="image.blur_placeholder"
      eager
    />
  </CarouselItem>
</template>
```

---

## 🧪 Тестирование:

### 1. Загрузите новый товар с изображениями

1. Откройте Admin панель → Products → Create Product
2. Загрузите изображения (>500KB для оптимизации)
3. Проверьте в консоли:
   ```
   ✅ image.jpg: 1.5 MB → 350 KB (↓77%) + 1 LQIP 💾
   ```

### 2. Проверьте БД

```sql
SELECT
  id,
  image_url,
  LENGTH(blur_placeholder) as blur_size,
  blur_placeholder IS NOT NULL as has_blur
FROM product_images
ORDER BY created_at DESC
LIMIT 5;
```

Должно быть:

```
has_blur: true
blur_size: ~2000-4000 (это размер base64 строки)
```

### 3. Откройте страницу товара

1. Network tab → Throttle → "Slow 3G"
2. Обновите страницу
3. **Должны увидеть:**
   - ✅ Мгновенно показывается blur preview
   - ✅ Потом плавно загружается полное изображение
   - ✅ Красивый переход

---

## 📊 Миграция существующих изображений

Если у вас уже есть товары без blur placeholder:

### Вариант 1: Скрипт генерации (рекомендую)

Создайте Nuxt server API endpoint `server/api/admin/generate-blur-placeholders.ts`:

```typescript
export default defineEventHandler(async (event) => {
  const supabase = useSupabaseClient()

  // Получаем все изображения без blur
  const { data: images } = await supabase
    .from('product_images')
    .select('*')
    .is('blur_placeholder', null)
    .limit(100)

  let processed = 0

  for (const image of images || []) {
    try {
      // Скачиваем изображение
      const { data: blob } = await supabase.storage
        .from('product-images')
        .download(image.image_url)

      if (!blob)
        continue

      // Генерируем blur
      const file = new File([blob], 'temp.jpg')
      const blurResult = await generateBlurPlaceholder(file)

      // Обновляем в БД
      await supabase
        .from('product_images')
        .update({ blur_placeholder: blurResult.dataUrl })
        .eq('id', image.id)

      processed++
    }
    catch (error) {
      console.error(`Failed to process ${image.id}:`, error)
    }
  }

  return { processed, total: images?.length || 0 }
})
```

Запустите:

```bash
curl http://localhost:3000/api/admin/generate-blur-placeholders
```

### Вариант 2: Ручная перезагрузка

Просто переза грузите изображения через Admin панель - они автоматически получат blur.

---

## 🎨 Кастомизация

### Изменить размер blur

В `utils/imageOptimizer.ts`:

```typescript
// Больше blur (10x10px)
await generateBlurPlaceholder(file, 10)

// Меньше blur (30x30px) - больше деталей
await generateBlurPlaceholder(file, 30)
```

### Изменить качество

```typescript
// Меньше качество = меньше размер
await generateBlurPlaceholder(file, 20, 0.3) // ~1 KB

// Больше качество = лучше preview
await generateBlurPlaceholder(file, 20, 0.7) // ~3 KB
```

### Отключить LQIP для конкретных мест

```vue
<!-- Использовать обычный shimmer -->
<ProgressiveImage
  :src="imageUrl"
  alt="..."
  placeholder-type="shimmer"
/>

<!-- Использовать простой blur -->
<ProgressiveImage
  :src="imageUrl"
  alt="..."
  placeholder-type="blur"
/>
```

---

## 🐛 Troubleshooting

### Проблема: blur_placeholder = null в БД

**Причина:** Изображение маленькое (<500KB) и не оптимизируется

**Решение:**

- Уменьшите порог в `shouldOptimizeImage()`
- Или всегда генерируйте blur: измените логику в `handleFilesChange()`

### Проблема: blur preview не показывается

**Причина:** `blurDataUrl` undefined или null

**Проверка:**

```vue
<template>
  <div>
    Blur: {{ blurDataUrl ? 'есть' : 'нет' }}
    Size: {{ blurDataUrl?.length }} bytes
  </div>
</template>
```

### Проблема: blur слишком большой размер

**Причина:** Слишком большой размер preview (>30px)

**Решение:** Уменьшите в `generateBlurPlaceholder(file, 15, 0.4)`

---

## 📚 Дополнительные ресурсы

- [Medium Engineering Blog - LQIP](https://medium.engineering/@Medium/the-lowdown-on-low-quality-image-placeholders-f7a9b76c5c0b)
- [Blurhash](https://blurha.sh/) - альтернативный подход
- [SQIP](https://github.com/axe312ger/sqip) - SVG-based LQIP

---

## ✅ Checklist

- [ ] Выполнена SQL миграция
- [ ] Обновлены TypeScript типы
- [ ] Обновлена логика сохранения изображений
- [ ] Обновлен ProductCard.vue
- [ ] Протестировано на Slow 3G
- [ ] (Опционально) Сгенерированы blur для существующих изображений

---

**Готово!** Теперь у вас профессиональная загрузка изображений как на Medium! 🎉
