import type { IProductFilters, ProductWithGallery } from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

export function useCatalogQuery(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
  pageSize: number = 12,
) {
  const productStore = useProductsStore()

  // 🔥 Генерируем стабильный ключ для кэша
  const queryKey = computed(() => {
    const f = unref(filters)
    return [
      'catalog-products',
      f.categorySlug,
      f.sortBy,
      unref(currentPage),
      pageSize,
      // Сериализуем только значимые фильтры
      f.subCategoryIds?.join(',') || 'no-sub',
      f.brandIds?.join(',') || 'no-brands',
      f.materialIds?.join(',') || 'no-materials',
      f.countryIds?.join(',') || 'no-countries',
      `${f.priceMin}-${f.priceMax}`,
      JSON.stringify(f.attributes || {}),
    ]
  })

  // ✅ ИСПРАВЛЕНИЕ: Следим за изменением категории/фильтров (без пагинации)
  const filtersWithoutPage = computed(() => {
    const f = unref(filters)
    return [
      f.categorySlug,
      f.sortBy,
      f.subCategoryIds?.join(',') || 'no-sub',
      f.brandIds?.join(',') || 'no-brands',
      f.materialIds?.join(',') || 'no-materials',
      f.countryIds?.join(',') || 'no-countries',
      `${f.priceMin}-${f.priceMax}`,
      JSON.stringify(f.attributes || {}),
    ].join('|')
  })

  // ✅ ИСПРАВЛЕНИЕ: Функция загрузки с AbortSignal
  const queryFn = async ({ signal }: { signal: AbortSignal }) => {
    const result = await productStore.fetchProducts(
      unref(filters),
      unref(currentPage),
      pageSize,
      signal, // Передаем signal для отмены
    )

    return result
  }

  // 🔥 Настройка Vue Query
  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: 5 * 60 * 1000, // 5 минут
    gcTime: 10 * 60 * 1000, // 10 минут

    // ✅ КРИТИЧНО: placeholderData только для пагинации
    placeholderData: (previousData, previousQuery) => {
      // Показываем старые данные ТОЛЬКО если меняется страница, но НЕ фильтры
      const prevPage = previousQuery?.queryKey[3] as number
      const currentPageValue = unref(currentPage)

      // Если это просто следующая страница - показываем старые данные
      if (prevPage && currentPageValue > prevPage) {
        return previousData
      }

      // Если изменились фильтры - НЕ показываем старые данные
      return undefined
    },

    retry: 1,

    // ✅ ДОБАВЛЕНО: Отменять запросы при размонтировании
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  })

  // 🔥 Удобные computed свойства
  const products = computed<ProductWithGallery[]>(() =>
    query.data.value?.products || [],
  )

  const hasMore = computed(() =>
    query.data.value?.hasMore || false,
  )

  // ✅ ДОБАВЛЕНО: Следим за изменением фильтров и сбрасываем кеш
  watch(filtersWithoutPage, () => {
    // При изменении фильтров очищаем данные для лучшего UX
    query.refetch()
  })

  return {
    // Данные
    products,
    hasMore,

    // Состояния
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,

    // Методы
    refetch: query.refetch,
  }
}
