# 🔄 Правильное управление кешированием

## Проблема

После подтверждения заказов через Telegram товары списывались в БД, но в UI показывались неактуальные остатки из-за кеширования.

## ❌ Неправильный подход

```typescript
// Слишком короткий staleTime
staleTime: 30 * 1000 // 30 секунд - слишком много запросов к БД!
```

**Почему плохо:**
- Лишние запросы к БД каждые 30 секунд
- Увеличение нагрузки на сервер
- Повышенный трафик
- Быстрый расход квоты Supabase

## ✅ Правильный подход: Stale-While-Revalidate

### 1. Умеренный кеш с автопроверкой

```typescript
const { data: product } = useQuery({
  queryKey: ['product', slug],
  queryFn: () => fetchProduct(slug),
  staleTime: 2 * 60 * 1000, // 2 минуты
  gcTime: 10 * 60 * 1000,   // 10 минут
  refetchOnMount: true,      // Проверить при открытии страницы
  refetchOnWindowFocus: true // Проверить при возврате на вкладку
})
```

**Как работает:**
1. Пользователь открывает страницу → показываются данные из кеша (мгновенно)
2. Если данные старше 2 минут → загружаются свежие в фоне
3. При возврате на вкладку → проверка свежести данных
4. UI не блокируется, нет мерцания

### 2. Инвалидация кеша по событиям

```typescript
import { useProductCacheInvalidation } from '@/composables/useProductCacheInvalidation'

const { invalidateAllProducts } = useProductCacheInvalidation()

// После подтверждения заказа
async function confirmOrder(orderId: string) {
  await supabase.rpc('confirm_order', { order_id: orderId })

  // Инвалидируем кеш - данные обновятся автоматически
  invalidateAllProducts()
}
```

**Преимущества:**
- Кеш обновляется только когда данные реально изменились
- Не нужно гадать с интервалами обновления
- Минимум запросов к БД

## 📊 Рекомендуемые значения staleTime

| Тип данных | staleTime | Обоснование |
|------------|-----------|-------------|
| Страница товара | 2-3 минуты | Остатки могут меняться |
| Каталог товаров | 2-3 минуты | Остатки и цены динамичны |
| Главная страница | 3-5 минут | Менее критично |
| Фильтры/бренды | 5-10 минут | Меняются редко |
| Настройки | 10-30 минут | Почти статичны |
| Контент страниц | 1 час | Статичный контент |

## 🎯 Best Practices

### 1. Использовать инвалидацию после мутаций

```typescript
// ✅ Правильно
const mutation = useMutation({
  mutationFn: updateProduct,
  onSuccess: (data) => {
    // Инвалидируем только то, что изменилось
    invalidateProduct(data.slug)
    invalidateCategoryProducts(data.categorySlug)
  }
})
```

```typescript
// ❌ Неправильно
staleTime: 0 // Запросы на каждый рендер!
```

### 2. Показывать старые данные пока загружаются новые

```typescript
const { data, isFetching } = useQuery({
  queryKey: ['products'],
  queryFn: fetchProducts,
  placeholderData: (previousData) => previousData, // Показываем старые данные
})
```

```vue
<template>
  <div :class="{ 'opacity-50': isFetching }">
    <!-- Контент не мерцает при обновлении -->
    <ProductList :products="data" />
  </div>

  <!-- Индикатор обновления в углу -->
  <div v-if="isFetching" class="fixed top-4 right-4">
    Обновление...
  </div>
</template>
```

### 3. Периодическое обновление только для критичных данных

```typescript
// Для аукционов, таймеров, остатков с высокой конкуренцией
const { data } = useQuery({
  queryKey: ['hot-product', productId],
  queryFn: () => fetchProduct(productId),
  staleTime: 2 * 60 * 1000,
  refetchInterval: 60 * 1000, // Обновлять каждую минуту
  refetchIntervalInBackground: false // Только когда вкладка активна
})
```

### 4. Префетч для часто посещаемых страниц

```typescript
function prefetchProduct(slug: string) {
  queryClient.prefetchQuery({
    queryKey: ['product', slug],
    queryFn: () => fetchProduct(slug),
    staleTime: 2 * 60 * 1000
  })
}
```

```vue
<template>
  <NuxtLink
    :to="`/products/${product.slug}`"
    @mouseenter="prefetchProduct(product.slug)"
  >
    {{ product.name }}
  </NuxtLink>
</template>
```

## 🔧 Использование композабла инвалидации

### В админке при редактировании товара

```typescript
// pages/admin/products/edit/[id].vue
const { invalidateProduct, invalidateCategoryProducts } = useProductCacheInvalidation()

async function saveProduct() {
  const updatedProduct = await mutation.mutateAsync(formData)

  // Инвалидируем кеш этого товара
  invalidateProduct(updatedProduct.slug)

  // Инвалидируем каталог категории
  invalidateCategoryProducts(updatedProduct.category_slug)

  toast.success('Товар обновлён. Кеш очищен.')
}
```

### После подтверждения заказа (webhook/edge function)

```typescript
// supabase/functions/confirm-order/index.ts
// После обновления остатков в БД можно отправить событие клиенту

// В клиенте (опционально):
const { invalidateAllProducts } = useProductCacheInvalidation()

// Слушать события из Supabase Realtime
supabase
  .channel('order-confirmations')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'orders',
    filter: 'status=eq.confirmed'
  }, () => {
    // Заказ подтвержден - обновить кеш товаров
    invalidateAllProducts()
  })
  .subscribe()
```

### При массовом изменении цен

```typescript
const { invalidateAllCatalogProducts } = useProductCacheInvalidation()

async function applyBulkPriceUpdate(products: Product[]) {
  await supabase.rpc('bulk_update_prices', { products })

  // Инвалидируем весь каталог
  invalidateAllCatalogProducts()

  toast.success(`Цены обновлены для ${products.length} товаров`)
}
```

## 🚀 Продвинутые техники

### 1. Optimistic Updates (для корзины, избранного)

```typescript
const mutation = useMutation({
  mutationFn: addToCart,
  onMutate: async (product) => {
    // Отменяем текущие запросы
    await queryClient.cancelQueries({ queryKey: ['cart'] })

    // Сохраняем старое состояние
    const previousCart = queryClient.getQueryData(['cart'])

    // Оптимистично обновляем UI
    queryClient.setQueryData(['cart'], (old) => [...old, product])

    return { previousCart }
  },
  onError: (err, variables, context) => {
    // Откатываем при ошибке
    queryClient.setQueryData(['cart'], context.previousCart)
  },
  onSettled: () => {
    // Всегда перезагружаем данные в конце
    queryClient.invalidateQueries({ queryKey: ['cart'] })
  }
})
```

### 2. Server-Sent Events для real-time обновлений

```typescript
// Для товаров с ограниченным количеством (билеты, горячие предложения)
onMounted(() => {
  const eventSource = new EventSource('/api/product-updates')

  eventSource.addEventListener('stock-update', (event) => {
    const { productId, newStock } = JSON.parse(event.data)

    // Обновляем кеш конкретного товара
    queryClient.setQueryData(['product', productId], (old) => ({
      ...old,
      stock_quantity: newStock
    }))
  })

  onUnmounted(() => eventSource.close())
})
```

## 📈 Мониторинг

### Отслеживание попаданий в кеш

```typescript
const queryClient = useQueryClient()

// В dev режиме
if (import.meta.dev) {
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === 'observerResultsUpdated') {
      console.log('Query updated:', event.query.queryKey)
    }
  })
}
```

### Статистика использования кеша

```typescript
function getCacheStats() {
  const cache = queryClient.getQueryCache()
  const queries = cache.getAll()

  return {
    total: queries.length,
    stale: queries.filter(q => q.state.isInvalidated).length,
    fresh: queries.filter(q => !q.state.isInvalidated).length,
  }
}
```

## 📚 Дополнительные ресурсы

- [TanStack Query Docs](https://tanstack.com/query/latest/docs/vue/overview)
- [Stale-While-Revalidate Strategy](https://web.dev/stale-while-revalidate/)
- [Caching Best Practices](https://tanstack.com/query/latest/docs/vue/guides/caching)

---

## ✅ Итоговая стратегия для uhti.kz

1. **staleTime: 2-3 минуты** для большинства данных
2. **refetchOnMount: true** - проверять при открытии страницы
3. **refetchOnWindowFocus: true** - проверять при возврате на вкладку
4. **Инвалидация кеша** после изменений в админке
5. **Optimistic updates** для корзины и избранного
6. **Префетч** для часто посещаемых страниц

**Результат:**
- ✅ Актуальные данные
- ✅ Минимум запросов к БД
- ✅ Быстрый UI без мерцания
- ✅ Эффективное использование ресурсов
