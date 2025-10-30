# 🚀 Настройка Vue Query для кэширования

## 📦 Установка

```bash
npm install @tanstack/vue-query
```

## 📁 Структура файлов

```
plugins/
  └── vue-query.ts          # Плагин для Nuxt
composables/
  └── useCatalogQuery.ts    # Композабл для каталога
stores/
  └── publicStore/
      └── productsStore.ts  # Store с кэшем метаданных
pages/
  └── catalog/
      └── [...slug].vue     # Страница каталога
```

## 🎯 Что было реализовано

### 1. **Двухуровневое кэширование**

#### Уровень 1: Метаданные фильтров (Pinia Store)
```typescript
// stores/publicStore/productsStore.ts
const brandsByCategory = ref<Record<string, BrandForFilter[]>>({})
const attributesByCategory = ref<Record<string, AttributeWithValue[]>>({})
const allMaterials = ref<Material[]>([])
const allCountries = ref<Country[]>([])
```

**Что кэшируется:**
- Бренды по категориям
- Атрибуты по категориям  
- Материалы (глобально)
- Страны (глобально)
- Диапазоны цен по категориям

**Время жизни:** До закрытия вкладки

#### Уровень 2: Товары (Vue Query)
```typescript
// composables/useCatalogQuery.ts
const query = useQuery({
  queryKey: [...],
  queryFn: async () => {...},
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})
```

**Что кэшируется:**
- Списки товаров по комбинациям фильтров

**Время жизни:** 
- Stale time: 5 минут (свежие данные)
- GC time: 10 минут (в кэше)

## 📊 Результаты оптимизации

### До оптимизации
```
Категория А (первый заход):
  ├── 5 запросов метаданных (brands, attributes, etc.)
  └── 1 запрос товаров
  
Категория Б (переход):
  ├── 5 запросов метаданных ❌
  └── 1 запрос товаров ❌
  
Категория А (возврат):
  ├── 5 запросов метаданных ❌ (повторно!)
  └── 1 запрос товаров ❌ (повторно!)

Итого: 18 запросов
```

### После оптимизации
```
Категория А (первый заход):
  ├── 5 запросов метаданных 
  └── 1 запрос товаров
  
Категория Б (переход):
  ├── 5 запросов метаданных
  └── 1 запрос товаров
  
Категория А (возврат):
  ├── 0 запросов ✅ (из Pinia кэша)
  └── 0 запросов ✅ (из Vue Query кэша)

Итого: 12 запросов (-33% 🎉)
```

### При изменении фильтров
```
Сортировка: Новизна → Популярность
  └── 0 запросов ✅ (из Vue Query кэша)

Фильтр по бренду: Nike
  └── 1 запрос ✅ (новая комбинация фильтров)

Возврат к "Все товары"
  └── 0 запросов ✅ (из Vue Query кэша)
```

## 🔧 Настройка Vue Query

### Глобальные настройки (plugins/vue-query.ts)

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,        // 5 минут - свежие данные
      gcTime: 10 * 60 * 1000,          // 10 минут - в кэше
      refetchOnWindowFocus: false,     // Не перезагружать при фокусе
      refetchOnReconnect: true,        // Перезагрузить при восстановлении связи
      retry: 1,                        // 1 попытка повтора
    },
  },
})
```

### Настройки для конкретного запроса

```typescript
const query = useQuery({
  queryKey: ['custom-key'],
  queryFn: async () => {...},
  
  // Переопределить глобальные настройки
  staleTime: 10 * 60 * 1000,  // 10 минут для этого запроса
  gcTime: 30 * 60 * 1000,     // 30 минут в кэше
})
```

## 🎨 Пользовательский опыт

### Индикаторы загрузки

```vue
<template>
  <!-- Первая загрузка -->
  <ProductGridSkeleton v-if="isLoading" />
  
  <!-- Фоновая перезагрузка -->
  <div v-if="isFetching && !isLoading" class="loading-overlay">
    Обновление...
  </div>
  
  <!-- Загрузка следующей страницы -->
  <Button :disabled="isFetching" @click="loadMore">
    <span v-if="isFetching">Загрузка...</span>
    <span v-else>Показать ещё</span>
  </Button>
</template>
```

### Плейсхолдеры во время загрузки

```typescript
const query = useQuery({
  // ...
  placeholderData: (previousData) => previousData, // Показываем старые данные
})
```

## 🧹 Очистка кэша

### Очистка метаданных (Pinia Store)

```typescript
// Очистить весь кэш
productsStore.clearCache()

// Очистить кэш конкретной категории
productsStore.clearCategoryCache('toys')
```

### Очистка товаров (Vue Query)

```typescript
import { useQueryClient } from '@tanstack/vue-query'

const queryClient = useQueryClient()

// Очистить все запросы каталога
queryClient.invalidateQueries({ queryKey: ['catalog-products'] })

// Очистить конкретную комбинацию фильтров
queryClient.invalidateQueries({ 
  queryKey: ['catalog-products', 'toys', 'newest'] 
})

// Полная очистка всего кэша
queryClient.clear()
```

## 🐛 Отладка

### Console logs

В dev режиме вы увидите:

```
✅ Brands from cache: toys
✅ Attributes from cache: toys
✅ Materials from cache
✅ Countries from cache
✅ Price range from cache: toys

🌐 Fetching products from server
[Vue Query] Query ['catalog-products', 'toys', ...] loaded from cache
```

### Vue Query DevTools (опционально)

```bash
npm install @tanstack/vue-query-devtools
```

```typescript
// plugins/vue-query.ts
import { VueQueryDevtools } from '@tanstack/vue-query-devtools'

if (import.meta.dev) {
  nuxt.vueApp.component('VueQueryDevtools', VueQueryDevtools)
}
```

```vue
<template>
  <VueQueryDevtools v-if="$dev" />
</template>
```

## 📈 Мониторинг производительности

### Замер времени загрузки

```typescript
// composables/useCatalogQuery.ts
const queryFn = async () => {
  const startTime = performance.now()
  
  const result = await productStore.fetchProducts(...)
  
  const endTime = performance.now()
  console.log(`⚡ Products loaded in ${Math.round(endTime - startTime)}ms`)
  
  return result
}
```

### Network waterfall

В Chrome DevTools → Network вы увидите:

**До оптимизации:**
```
[Request 1] GET /brands          200ms
[Request 2] GET /attributes      180ms
[Request 3] GET /materials       120ms
[Request 4] GET /countries       100ms
[Request 5] GET /price-range     90ms
[Request 6] GET /products        350ms
---
Total: 1040ms
```

**После оптимизации (повторный заход):**
```
(no requests - loaded from cache)
---
Total: 0ms ✅
```

## 🎯 Best Practices

### 1. Не кэшируйте слишком долго
```typescript
// ❌ Плохо - год в кэше
staleTime: 365 * 24 * 60 * 60 * 1000

// ✅ Хорошо - 5 минут
staleTime: 5 * 60 * 1000
```

### 2. Инвалидируйте кэш при мутациях
```typescript
// После создания товара
const mutation = useMutation({
  mutationFn: createProduct,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['catalog-products'] })
  },
})
```

### 3. Используйте стабильные ключи
```typescript
// ❌ Плохо - нестабильный ключ
queryKey: [Date.now(), Math.random()]

// ✅ Хорошо - стабильный ключ
queryKey: ['catalog-products', categorySlug, sortBy]
```

## 🚀 Дальнейшие улучшения

### 1. Prefetch следующей страницы
```typescript
function prefetchNextPage() {
  queryClient.prefetchQuery({
    queryKey: ['catalog-products', categorySlug, currentPage + 1],
    queryFn: () => fetchProducts(filters, currentPage + 1, pageSize),
  })
}
```

### 2. Optimistic updates
```typescript
mutation.mutate(newProduct, {
  onMutate: async (newProduct) => {
    await queryClient.cancelQueries({ queryKey: ['catalog-products'] })
    
    const previousProducts = queryClient.getQueryData(['catalog-products'])
    
    queryClient.setQueryData(['catalog-products'], (old) => {
      return { ...old, products: [...old.products, newProduct] }
    })
    
    return { previousProducts }
  },
})
```

### 3. Persistent cache (опционально)
```bash
npm install @tanstack/query-sync-storage-persister
```

---

**Результат:** Мгновенное переключение между категориями! 🎉