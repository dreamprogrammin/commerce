import type { IProductFilters, ProductWithGallery } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

/**
 * Товары каталога с префетчем на сервере.
 *
 * Функция асинхронная намеренно: без `await` SSR не работает вовсе. Раньше
 * здесь стоял `useAsyncData(...)` без ожидания, а `ssrData.value` читался
 * следующей строкой — синхронно, когда промис ещё не разрешился. Поэтому
 * `setQueryData` не вызывался ни разу, `initialData` оставалась undefined,
 * и сервер отдавал страницу категории со скелетонами.
 *
 * Данные при этом добывались: они лежали в payload (441 КБ на /catalog/boys),
 * просто в разметку не попадали. Клиент запрашивал их заново, и на мобильном
 * соединении сетка появлялась только к 10-й секунде — RPC стартовал на 7.9 с,
 * потому что до него нужно было скачать и разобрать 273 КБ JS.
 */
export async function useCatalogQuery(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
  pageSize: number = 12,
) {
  const productStore = useProductsStore()
  const queryClient = useQueryClient()
  const nuxtApp = useNuxtApp()

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

  // SSR: сначала дожидаемся данных и кладём их в кеш, и только потом создаём
  // запрос. Порядок принципиален в обе стороны, оба варианта проверены:
  //
  //  • посев ПОСЛЕ useQuery не работает — на сервере vue-query не подписывает
  //    наблюдателя на кеш, и setQueryData в отрисовку уже не попадает;
  //  • `await` перед useQuery ломает инъекцию: внутри useQuery вызывается
  //    useQueryClient(), а после ожидания контекст потерян, и страница
  //    отдаёт 500 — «vue-query hooks can only be used inside setup()».
  //
  // Отсюда решение: клиент берём синхронно выше и передаём в useQuery вторым
  // аргументом, чтобы тот не искал его через инъекцию.
  // Условие охватывает и клиент во время гидратации. Иначе браузер начинал бы
  // с пустого кеша, рисовал скелетон поверх пришедшей с сервера сетки и давал
  // рассинхрон гидратации. При гидратации useAsyncData поднимает значение из
  // payload и повторного запроса не делает; на последующих переходах по сайту
  // условие ложно, и данными занимается уже сам useQuery.
  if (import.meta.server || nuxtApp.isHydrating) {
    const ssrKey = `ssr-catalog-${JSON.stringify(queryKey.value)}`

    const { data: ssrData } = await useAsyncData(
      ssrKey,
      () => queryFn(),
      { server: true },
    )

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
  }, queryClient)

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
