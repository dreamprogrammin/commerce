# Drag & Drop сортировка изображений товара

**Дата:** 18 марта 2026
**Статус:** Завершено

## Проблема

Администратор не мог контролировать порядок фотографий товара. Изображения загружались асинхронно, и порядок в БД мог быть случайным. Не было визуального способа выбрать главное (обложку) фото.

## Что было до изменений

- Колонка `display_order` в `product_images` уже существовала
- Библиотека `vue-draggable-next` была установлена, но не использовалась
- Store уже обновлял `display_order` при сохранении
- В ProductForm.vue изображения разделялись на два раздельных грида: "Сохранённые" и "Новые"
- Кнопка "Сделать главной" перемещала изображение в начало массива
- Не все запросы к БД сортировали `product_images` по `display_order`

## Что сделано

### Часть 1: UI Админ-панели (Drag & Drop)

**Файл:** `components/admin/products/ProductForm.vue`

- Добавлен тип `GalleryItem` — объединяет existing и new изображения в единый список
- Добавлен writable `computed` `galleryItems` — единый сортируемый массив. При изменении порядка автоматически синхронизирует `existingImages` и `newImageFiles`
- Подключена `VueDraggableNext` — drag & drop для grid-сетки изображений
- Два раздельных грида (Сохранённые / Новые) заменены одним unified grid
- Первое изображение автоматически получает бейдж "Главное" с иконкой звезды
- Остальные изображения показывают порядковый номер (2, 3, 4...)
- Новые изображения имеют бейдж "Новое"
- Добавлена функция `removeGalleryItem()` — удаление из unified gallery
- Удалены устаревшие функции `setPrimaryExistingImage()` и `setPrimaryNewImage()` — теперь порядок меняется drag & drop

### Часть 2: Сортировка при чтении (ORDER BY)

Добавлен `.order('display_order', { referencedTable: 'product_images', ascending: true })` во все запросы, где он отсутствовал:

**`stores/adminStore/adminProductsStore.ts`:**
- `fetchProducts()` — список товаров
- `fetchProductById()` — загрузка одного товара
- `fetchProductBySku()` — поиск по артикулу
- `fetchProductsByIds()` — загрузка по ID

**`stores/publicStore/productsStore.ts`:**
- `fetchProductBySlug()` — страница товара
- `fetchFeaturedProducts()` — избранные товары + fallback
- `fetchSimilarProducts()` — похожие товары

**Запросы, которые уже имели сортировку (не изменены):**
- `fetchProductsByIds()` в publicStore — уже был `.order('display_order')`
- `get_filtered_products()` RPC — сортировка в SQL
- `useProductSearch` composable — сортировка в JS `.sort()`
- Sitemap routes — сортировка в JS `.sort()`

### Часть 3: Бэкфилл

**Файл:** `supabase/migrations/20260318000001_backfill_product_images_display_order.sql`

Миграция проставляет `display_order` для всех существующих товаров:
- Сортирует изображения по `created_at ASC`
- Присваивает `0, 1, 2...` для каждого товара
- Идемпотентная — можно запускать повторно

### Часть 4: Бэкенд логика (Store)

Store уже корректно обрабатывает порядок при сохранении:
- Existing images получают `display_order: 0, 1, 2...` по порядку в массиве
- Новые images получают `display_order: existingImages.length + i`
- Изменений в store логике сохранения не потребовалось

## Изменённые файлы

| Файл | Изменения |
|---|---|
| `components/admin/products/ProductForm.vue` | Drag & drop UI, unified gallery |
| `stores/adminStore/adminProductsStore.ts` | ORDER BY display_order в 4 запросах |
| `stores/publicStore/productsStore.ts` | ORDER BY display_order в 4 запросах |
| `supabase/migrations/20260318000001_...` | Бэкфилл display_order |

## UX изменения

| До | После |
|---|---|
| Два раздельных грида (Сохранённые/Новые) | Единый grid с drag & drop |
| Кнопка "Сделать главной" | Перетаскивание на первую позицию |
| Нет визуальной нумерации | Порядковые номера на каждом фото |
| Непонятно какое фото главное | Бейдж "Главное" + amber border |

## Ограничения

- После drag & drop новые изображения (ещё не загруженные) всегда сохраняются после существующих. Это ограничение store-архитектуры — после сохранения порядок фиксируется и можно свободно переупорядочить.
