import type { IProductFilters, ProductWithGallery } from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

export function useCatalogQuery(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
  pageSize: number = 12,
) {
  const productStore = useProductsStore()

  // 🔥 Генерируем простой ключ для кэша
  const queryKey = computed(() => {
    const f = unref(filters)
    return [
      'catalog-products',
      f.categorySlug,
      f.sortBy,
      unref(currentPage),
      f.subCategoryIds?.join(',') || '',
      f.brandIds?.join(',') || '',
      f.materialIds?.join(',') || '',
      f.countryIds?.join(',') || '',
      `${f.priceMin}-${f.priceMax}`,
      JSON.stringify(f.attributes || {}),
    ]
  })

  // ✅ Функция загрузки с AbortSignal
  const queryFn = async ({ signal }: { signal: AbortSignal }) => {
    const result = await productStore.fetchProducts(
      unref(filters),
      unref(currentPage),
      pageSize,
      signal,
    )
    return result
  }

  // ✅ Stale-While-Revalidate подход
  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: 2 * 60 * 1000, // 2 минуты - показываем старые данные, загружаем новые в фоне
    gcTime: 10 * 60 * 1000, // 10 минут в памяти
    retry: false, // Отключаем retry для быстроты
    refetchOnWindowFocus: true, // Проверить при возврате на вкладку
    refetchOnMount: true, // Проверить при монтировании (если данные старше staleTime)
    refetchOnReconnect: false,
  })

  const products = computed<ProductWithGallery[]>(() =>
    query.data.value?.products || [],
  )

  const hasMore = computed(() =>
    query.data.value?.hasMore || false,
  )

  return {
    products,
    hasMore,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  }
}
