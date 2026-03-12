# Smart Sidebar — Контекстные фильтры для страниц брендов и линеек

## Обзор

Внедрена система контекстных фильтров (Smart Sidebar) для страниц `/brand/[slug]` и `/brand/[brandSlug]/[lineSlug]`. Фильтры автоматически адаптируются к типу страницы, скрывая нерелевантные секции.

## Архитектура

### Единый composable: `useBrandPageFilters`

**Файл**: `composables/useBrandPageFilters.ts`

Центральный composable, управляющий состоянием фильтров для обоих типов страниц. Принимает параметры:

| Параметр | Тип | Описание |
|----------|-----|----------|
| `brandId` | `Ref<string \| undefined>` | ID бренда (автозаполнение из route) |
| `productLineId` | `Ref<string \| undefined>` | ID линейки (только для `context: 'line'`) |
| `context` | `'brand' \| 'line'` | Тип страницы |
| `brandProductLines` | `Ref<ProductLine[]>` | Линейки бренда (для фильтра коллекций) |

**Возвращаемое состояние** (`BrandFilterState`):
- Продукты: `products`, `isLoading`
- Фильтры: `sortBy`, `selectedProductLineIds`, `selectedMaterialIds`, `selectedCountryIds`, `priceFilter`, `localPrice`
- Метаданные: `priceRange`, `availableProductLines`, `availableMaterials`, `availableCountries`, `activeFiltersCount`
- Контекст: `hideBrands`, `hideProductLines`
- Методы: `loadProducts()`, `loadFilterData()`, `resetFilters()`, `toggleProductLine()`, `toggleMaterial()`, `toggleCountry()`, `commitPrice()`

### Контекстная адаптация

| Фильтр | Страница бренда (`context: 'brand'`) | Страница линейки (`context: 'line'`) |
|--------|--------------------------------------|--------------------------------------|
| Коллекции | Показан | Скрыт |
| Цена | Показан | Показан |
| Материал | Показан | Показан |
| Страна | Показан | Показан |
| Бренд | Скрыт (всегда) | Скрыт (всегда) |

### Компоненты фильтров

| Компонент | Файл | Назначение |
|-----------|------|------------|
| `BrandFilterSidebar` | `components/brand/BrandFilterSidebar.vue` | Desktop sidebar (lg+), sticky, Collapsible секции |
| `BrandFilterMobile` | `components/brand/BrandFilterMobile.vue` | Mobile Drawer (< lg), полноэкранный |

Оба компонента принимают единственный проп `state: BrandFilterState` и полностью реактивны.

## Изменённые файлы

### Новые файлы
- `composables/useBrandPageFilters.ts` — Composable фильтрации
- `components/brand/BrandFilterSidebar.vue` — Desktop sidebar
- `components/brand/BrandFilterMobile.vue` — Mobile drawer

### Обновлённые файлы
- `components/brand/BrandStandardTemplate.vue` — Интеграция sidebar + filterState вместо прямых пропсов
- `components/brand/BrandCustomTemplate.vue` — Интеграция sidebar + filterState вместо прямых пропсов
- `pages/brand/[slug].vue` — Инициализация composable, передача filterState в шаблоны
- `pages/brand/[brandSlug]/[lineSlug].vue` — Замена ручной загрузки на composable с `context: 'line'`

## Технические решения

### Загрузка продуктов
Используется `productsStore.fetchProducts()` с RPC `get_filtered_products`. Параметр `categorySlug: 'all'` позволяет искать по всем категориям с фильтрацией по `brandId`.

### Ценовой диапазон
Store RPC `fetchPriceRangeForCategory('all')` возвращает захардкоженные `{0, 50000}`. Решение: диапазон вычисляется клиентски из первой загрузки продуктов (до применения ценовых фильтров), с округлением до 100.

### Debounce
Изменения фильтров триггерят перезагрузку продуктов с debounce 300ms через `watch(..., { deep: true })`.

### Layout
Desktop: `flex gap-6` с `aside w-64 shrink-0` (sticky) + `main flex-1 min-w-0`
Mobile: Кнопка фильтров рядом с CatalogHeader, открывает Drawer

## Принципы

1. **Единый composable** — вся логика фильтрации в одном месте, переиспользуется на 4 страницах (Standard, Custom, brand page, line page)
2. **Не затронуты каталожные фильтры** — `DynamicFilters.vue` и `DynamicFiltersMobile.vue` остались без изменений
3. **SEO сохранён** — структурированные данные продолжают использовать `filterState.products.value` для schema.org разметки
4. **Type-safe** — `BrandFilterState` экспортируется как `ReturnType<typeof useBrandPageFilters>`
