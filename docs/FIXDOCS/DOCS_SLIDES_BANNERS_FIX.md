# Bugfix: Слайды/Баннеры — зависание blur + broken image + утечка Storage (2026-03-03)

## Проблемы

### 1. Слайды зависают на blur (LQIP не пропадает)
**Симптом**: Слайды в карусели показывают размытый placeholder вечно, даже после загрузки изображения.

**Root Cause**: В `AppCarousel.vue` свойство `_loaded` создавалось как plain-поле на объекте внутри `computed`. Vue не отслеживает мутации plain-полей — `@load="slide._loaded = true"` меняет значение, но `v-if="!slide._loaded"` не реагирует.

**Fix**: Заменён `_loaded` на `reactive(new Set<string>())` — `loadedSlideIds`. При `@load` вызывается `onSlideImageLoaded(slide.id)`, Vue корректно отслеживает `loadedSlideIds.has(slide.id)`.

### 2. Баннеры показывают "Не загрузилось"
**Симптом**: Баннеры на главной странице отображают ошибку broken image.

**Root Cause**: `Banners.vue` использовал хардкоженый `'banners'` вместо `BUCKET_NAME_BANNERS` и не имел fallback при построении URL.

**Fix**: Импортирована константа `BUCKET_NAME_BANNERS`. Добавлен fallback: `getVariantUrlWide(...) || getPublicUrl(...)` для совместимости со старыми изображениями без variant-суффиксов.

### 3. Утечка файлов в Storage при удалении/замене изображений
**Симптом**: При обновлении слайда/баннера или удалении изображения без замены старые файлы (`_sm.webp`, `_md.webp`, `_lg.webp`) оставались в bucket.

**Root Cause**: В `useSlideForm.ts` и `useBannerForm.ts` удаление старых файлов происходило ТОЛЬКО при загрузке нового изображения. Если пользователь просто удалял изображение (без замены), Storage не чистился.

**Fix**: Добавлен `else if` блок — если `formData.image_url` стал `null` но `imageToDelete` содержит старый путь, вызывается `removeFile()`.

### 4. Stale blur_data_url в useBannerForm.ts
**Симптом**: При загрузке нового изображения баннера blur placeholder мог не обновиться.

**Root Cause**: Переменная `blurDataUrl` захватывалась в начале `handleSubmit` через `const`, а обновление `formData.value.blur_data_url` ниже по коду не влияло на уже захваченное значение.

**Fix**: `const blurDataUrl` → `let blurDataUrl`, обновляется напрямую при получении нового blur из `_uploadWideVariants`.

## Рефакторинг: shared utility `getVariantPathsWide`

Дублированная функция `_getVariantPaths()` была в 4 файлах. Вынесена в `utils/storageVariants.ts`:

```typescript
// utils/storageVariants.ts
export function getVariantPathsWide(basePath: string): string[]
export function getVariantPaths(basePath: string): string[]
export function isLegacyImagePath(url: string): boolean
```

## Изменённые файлы

| Файл | Что изменено |
|------|-------------|
| `utils/storageVariants.ts` | **NEW** — shared utility для построения путей вариантов |
| `components/common/AppCarousel.vue` | `_loaded` → `reactive Set`, корректная реактивность blur overlay |
| `components/home/Banners.vue` | `BUCKET_NAME_BANNERS` + fallback URL |
| `composables/admin/useSlideForm.ts` | Storage cleanup при удалении без замены + shared utility |
| `composables/admin/useBannerForm.ts` | Fix stale blur + storage cleanup + shared utility |
| `composables/admin/useAdminSlides.ts` | Shared utility вместо дублированной `_getVariantPaths` |
| `composables/admin/useAdminBanners.ts` | Shared utility вместо дублированной `_getVariantPaths` |

## Ключевой паттерн: реактивное отслеживание загрузки изображений

```typescript
// ❌ НЕ РАБОТАЕТ — plain поле на computed объекте
const items = computed(() => data.map(d => ({ ...d, _loaded: false })))
// @load="item._loaded = true" — Vue не видит мутацию

// ✅ ПРАВИЛЬНО — reactive Set
const loadedIds = reactive(new Set<string>())
function onLoaded(id: string) { loadedIds.add(id) }
// v-if="!loadedIds.has(item.id)" — Vue корректно реагирует
```

## Ключевой паттерн: Storage cleanup при удалении изображения

```typescript
// Upload new + delete old
if (newFile.value) {
  const result = await uploadVariants(newFile.value.file)
  finalPath = result.basePath
  if (oldPath && oldPath !== finalPath) {
    await removeFile(bucket, getVariantPathsWide(oldPath))
  }
}
// Remove without replacement — ОБЯЗАТЕЛЬНО чистим Storage
else if (!formData.value.image_url && oldImageToDelete.value) {
  await removeFile(bucket, getVariantPathsWide(oldImageToDelete.value))
  finalPath = null
}
```
