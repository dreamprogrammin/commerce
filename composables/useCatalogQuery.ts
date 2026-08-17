import type { IProductFilters, ProductWithGallery } from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

export interface CatalogPage {
  products: ProductWithGallery[]
  hasMore: boolean
}

/**
 * Ключ запроса. Вынесен, чтобы префетч и сам запрос считали его одинаково:
 * разойдись они хоть в одном поле — посев кеша не найдёт наблюдатель.
 */
function buildQueryKey(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
): unknown[] {
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
}

/**
 * Данные каталога для первой отрисовки.
 *
 * Зовётся ТОЛЬКО верхнеуровневым `await` из `<script setup>`. Это не
 * придирка к стилю, а условие работоспособности: компилятор оборачивает
 * такой await в `withAsyncContext`, и после него остаются живыми и
 * контекст Nuxt, и активный effect scope. Внутри обычной async-функции
 * этого не происходит.
 *
 * Здесь же и вся история вопроса, чтобы её не проходили заново:
 *
 *  • без ожидания SSR не работает совсем — `useAsyncData` только запускает
 *    запрос, `data.value` на следующей строке ещё пуст, кеш не засевается,
 *    и сервер отдаёт страницу категории со скелетонами;
 *  • посев ПОСЛЕ `useQuery` бесполезен — на сервере vue-query не подписывает
 *    наблюдателя на кеш, и `setQueryData` в отрисовку не попадает;
 *  • `await` ВНУТРИ композабла (так было с 14 августа) ломает две вещи
 *    сразу: инъекцию (`useQuery` зовёт `useQueryClient` и падает с
 *    «vue-query hooks can only be used inside setup()») и effect scope.
 *    Первое обходилось передачей клиента вторым аргументом, второе — нет:
 *    в консоли оставались «useQuery() should only be used inside setup()»
 *    и «onScopeDispose() is called when there is no active effect scope»,
 *    а страница категории получала рассинхрон гидратации.
 *
 * Отсюда текущее разделение: ожидание — на странице, композабл ниже
 * синхронный, посев кеша происходит до создания запроса.
 */
export async function useCatalogSsrData(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
  pageSize: number = 12,
): Promise<CatalogPage | null> {
  const nuxtApp = useNuxtApp()

  // На переходах внутри сайта данными занимается сам useQuery: там уже есть
  // и кеш, и рабочий клиент. Префетч нужен только серверу и первой отрисовке
  // в браузере, иначе браузер стартовал бы с пустым кешем и рисовал скелетон
  // поверх пришедшей с сервера сетки.
  if (!import.meta.server && !nuxtApp.isHydrating)
    return null

  const productStore = useProductsStore()
  const ssrKey = `ssr-catalog-${JSON.stringify(buildQueryKey(filters, currentPage))}`

  const { data } = await useAsyncData(
    ssrKey,
    () => productStore.fetchProducts(unref(filters), unref(currentPage), pageSize),
    { server: true },
  )

  return data.value ?? null
}

/**
 * Товары каталога. Синхронный — см. пояснение у `useCatalogSsrData` выше.
 *
 * `ssrData` — результат префетча. Если он есть, кладём его в кеш ДО создания
 * запроса, и тогда наблюдатель отдаёт данные сразу, а сетка попадает
 * в серверную разметку.
 */
export function useCatalogQuery(
  filters: Ref<IProductFilters>,
  currentPage: Ref<number>,
  pageSize: number = 12,
  ssrData: CatalogPage | null = null,
) {
  const productStore = useProductsStore()
  const queryClient = useQueryClient()

  const queryKey = computed(() => buildQueryKey(filters, currentPage))

  const queryFn = async () => {
    return await productStore.fetchProducts(
      unref(filters),
      unref(currentPage),
      pageSize,
    )
  }

  if (ssrData) {
    queryClient.setQueryData(queryKey.value, ssrData)
  }

  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: false,
    refetchOnWindowFocus: true,
    // Было 'always' — запрос уходил сразу после монтирования, хотя те же
    // данные только что пришли с сервера и лежат в кеше. Отсюда две беды:
    //
    //  • лишний вызов get_filtered_products на каждой загрузке страницы;
    //  • рассинхрон гидратации. На сервере isFetching ложно, и кнопка
    //    «Показать ещё» рисуется обычной; на клиенте к моменту гидратации
    //    запрос уже идёт, isFetching истинно — и Vue ругался
    //    «rendered on server: (not rendered) / expected on client:
    //    disabled="true"» плюс подменой <span> на начало фрагмента.
    //
    // `true` — поведение по умолчанию: перезапрос при монтировании, только
    // если данные протухли. Свежесть по-прежнему держит staleTime (2 минуты)
    // и refetchOnWindowFocus.
    refetchOnMount: true,
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
