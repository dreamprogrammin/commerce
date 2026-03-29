import type { IProductFilters, ProductWithGallery } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

export function useCatalogQuery(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
  pageSize: number = 12,
) {
  const productStore = useProductsStore()
  const queryClient = useQueryClient()

  const queryKey = computed(() => {
    const f = unref(filters)
    return [
      'catalog-products',
      f.categorySlug,
      f.sortBy,
      unref(currentPage),
      f.subCategoryIds?.join(',') || '',
      f.brandIds?.join(',') || '',
      f.productLineIds?.join(',') || '',
      f.materialIds?.join(',') || '',
      f.countryIds?.join(',') || '',
      `${f.priceMin}-${f.priceMax}`,
      JSON.stringify(f.attributes || {}),
      `${f.pieceCountMin}-${f.pieceCountMax}`,
      JSON.stringify(f.numericAttributes || []),
    ]
  })

  const queryFn = async () => {
    return await productStore.fetchProducts(
      unref(filters),
      unref(currentPage),
      pageSize,
    )
  }

  // 🔥 SSR prefetch: на сервере дожидаемся данных и кладём в кеш TanStack Query
  // Без этого на сервере query.data.value === undefined и ItemList не рендерится
  if (import.meta.server) {
    const ssrKey = computed(() => `ssr-catalog-${JSON.stringify(queryKey.value)}`)

    const { data: ssrData } = useAsyncData(
      ssrKey.value,
      () => queryFn(),
      { server: true },
    )

    // Кладём SSR-данные в кеш TanStack Query чтобы useQuery взял их синхронно
    if (ssrData.value) {
      queryClient.setQueryData(queryKey.value, ssrData.value)
    }
  }

  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
    // На сервере берём данные из кеша (setQueryData выше)
    initialData: import.meta.server
      ? queryClient.getQueryData(queryKey.value)
      : undefined,
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