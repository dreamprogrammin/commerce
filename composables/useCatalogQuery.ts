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

  // 🔥 Функция загрузки данных
  const queryFn = async () => {
    const result = await productStore.fetchProducts(
      unref(filters),
      unref(currentPage),
      pageSize,
    )

    return result
  }

  // 🔥 Настройка Vue Query
  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: 5 * 60 * 1000, // 5 минут - данные считаются свежими
    gcTime: 10 * 60 * 1000, // 10 минут - время жизни в кэше (было cacheTime)
    placeholderData: previousData => previousData, // Показываем старые данные пока грузятся новые
    retry: 1, // Одна попытка повтора при ошибке
  })

  // 🔥 Удобные computed свойства
  const products = computed<ProductWithGallery[]>(() =>
    query.data.value?.products || [],
  )

  const hasMore = computed(() =>
    query.data.value?.hasMore || false,
  )

  return {
    // Данные
    products,
    hasMore,

    // Состояния
    isLoading: query.isLoading, // ✅ Исправлено: было isFetched
    isFetching: query.isFetching, // Загрузка в фоне
    isError: query.isError,
    error: query.error,

    // Методы
    refetch: query.refetch,
  }
}
