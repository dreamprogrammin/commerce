import type {
  Country,
  IProductFilters,
  Material,
  ProductLine,
  ProductWithGallery,
  SortByType,
} from '@/types'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

export type BrandPageContext = 'brand' | 'line'

interface UseBrandPageFiltersOptions {
  brandId: Ref<string | undefined>
  productLineId?: Ref<string | undefined>
  context: BrandPageContext
  brandProductLines?: Ref<ProductLine[]>
  /**
   * Товары, добытые до отрисовки (см. `useBrandPageSsrProducts`). Кладутся в
   * кеш ДО создания запроса, иначе в серверную разметку они не попадут.
   */
  ssrProducts?: ProductWithGallery[] | null
}

/** Сколько товаров тянем за раз — и в префетче, и в самом запросе. */
const BRAND_PAGE_SIZE = 200

/**
 * Ключ запроса. Вынесен наружу, чтобы префетч и сам запрос считали его
 * одинаково: разойдись они хоть в одном поле — посев кеша не найдёт
 * наблюдатель, и сервер отдаст пустую сетку.
 */
function buildBrandQueryKey(context: BrandPageContext, f: IProductFilters): unknown[] {
  return [
    'brand-page-products',
    context,
    f.brandIds?.join(',') || '',
    f.productLineIds?.join(',') || '',
    f.sortBy,
    f.materialIds?.join(',') || '',
    f.countryIds?.join(',') || '',
    `${f.priceMin ?? 0}-${f.priceMax ?? 0}`,
  ]
}

/**
 * Товары бренд-страницы для первой отрисовки.
 *
 * Зовётся ТОЛЬКО верхнеуровневым `await` из `<script setup>` — компилятор
 * оборачивает такой await в `withAsyncContext`, и после него живы и контекст
 * Nuxt, и активный effect scope. Внутри обычной async-функции этого не
 * происходит; на странице категории попытка ждать внутри композабла стоила
 * рассинхрона гидратации (см. пояснение в `useCatalogQuery.ts`).
 *
 * Зачем вообще. До 22 августа товары бренд-страницы грузились только
 * клиентским `useQuery`, и в серверной разметке их не было НИ ОДНОГО —
 * при 14 активных товарах у LEGO и 8 у ZURU. Google это заметил: инспекция
 * показывала `Soft 404` у `/brand/lego/lego-dc`, `Crawled - currently not
 * indexed` у `/brand/mattel` и `/brand/lego/lego-friends`. Робот видел
 * страницу с одним заголовком и отказывался её индексировать, хотя для
 * человека она была полной.
 */
export async function useBrandPageSsrProducts(
  brandId: Ref<string | undefined>,
  productLineId?: Ref<string | undefined>,
): Promise<ProductWithGallery[] | null> {
  const nuxtApp = useNuxtApp()

  // На переходах внутри сайта данными занимается сам useQuery: там уже есть
  // и кеш, и рабочий клиент. Префетч нужен серверу и первой отрисовке в
  // браузере, иначе клиент стартовал бы с пустым кешем и рисовал скелетон
  // поверх пришедшей с сервера сетки.
  if (!import.meta.server && !nuxtApp.isHydrating)
    return null

  if (!brandId.value)
    return null

  const productsStore = useProductsStore()
  const lineId = productLineId?.value

  const { data } = await useAsyncData(
    `ssr-brand-products-${brandId.value}-${lineId ?? 'all'}`,
    async () => {
      const result = await productsStore.fetchProducts(
        {
          /*
           * `categorySlug: 'all'` обязателен, и это не косметика: RPC
           * `get_filtered_products` объявлен с параметром `p_category_slug`,
           * и без него PostgREST отвечает PGRST202 «функция не найдена» —
           * запрос падает целиком, а не возвращает пустой список. Ровно то
           * же значение подставляет клиентский путь ниже (`catalogFilters`),
           * иначе ключ запроса разойдётся с посевом.
           */
          categorySlug: 'all',
          brandIds: [brandId.value!],
          ...(lineId ? { productLineIds: [lineId] } : {}),
          sortBy: 'newest',
        } as IProductFilters,
        1,
        BRAND_PAGE_SIZE,
      )
      return result.products
    },
    { server: true },
  )

  return data.value ?? null
}

export function useBrandPageFilters(options: UseBrandPageFiltersOptions) {
  const productsStore = useProductsStore()

  // ── Products state ──
  const products = shallowRef<ProductWithGallery[]>([])
  const isLoading = ref(true)
  const mobileFiltersOpen = ref(false)

  // ── Filter state ──
  const sortBy = ref<SortByType>('newest')
  const selectedProductLineIds = ref<string[]>([])
  const selectedMaterialIds = ref<string[]>([])
  const selectedCountryIds = ref<string[]>([])
  const priceFilter = ref<[number, number]>([0, 50000])
  const localPrice = ref<[number, number]>([0, 50000])

  // ── Filter metadata ──
  const priceRange = ref({ min: 0, max: 50000 })
  const availableMaterials = ref<Material[]>([])
  const availableCountries = ref<Country[]>([])
  let priceRangeInitialized = false

  // ── Context-aware visibility ──
  const hideBrands = true
  const hideProductLines = computed(() => options.context === 'line')

  const availableProductLines = computed<ProductLine[]>(() => {
    if (options.context === 'line')
      return []
    return options.brandProductLines?.value || []
  })

  // ── Build IProductFilters for fetchProducts ──
  const catalogFilters = computed<IProductFilters>(() => {
    const filters: IProductFilters = {
      categorySlug: 'all',
      brandIds: options.brandId.value ? [options.brandId.value] : undefined,
      sortBy: sortBy.value,
    }

    if (options.context === 'line' && options.productLineId?.value) {
      filters.productLineIds = [options.productLineId.value]
    }
    else if (selectedProductLineIds.value.length > 0) {
      filters.productLineIds = selectedProductLineIds.value
    }

    if (priceFilter.value[0] > priceRange.value.min) {
      filters.priceMin = priceFilter.value[0]
    }
    if (priceFilter.value[1] < priceRange.value.max) {
      filters.priceMax = priceFilter.value[1]
    }

    if (selectedMaterialIds.value.length > 0) {
      filters.materialIds = selectedMaterialIds.value
    }

    if (selectedCountryIds.value.length > 0) {
      filters.countryIds = selectedCountryIds.value
    }

    return filters
  })

  // ── TanStack Query для кеширования товаров ──
  const queryKey = computed(() => buildBrandQueryKey(options.context, catalogFilters.value))

  /*
   * Посев кеша ДО создания запроса — иначе на сервере vue-query не подпишет
   * наблюдателя, и `setQueryData` в отрисовку не попадёт.
   */
  const queryClient = useQueryClient()
  if (options.ssrProducts)
    queryClient.setQueryData(queryKey.value, options.ssrProducts)

  const queryEnabled = computed(() => !!options.brandId.value)

  const query = useQuery({
    queryKey,
    /*
     * `initialData`, а не только посев кеша. Ниже стоят два `watch` с
     * `immediate: true`, которые синхронизируют `products` и `isLoading` из
     * запроса, — и они срабатывают ПОСЛЕ создания `useQuery`, затирая всё,
     * что положено раньше. С `initialData` запрос сразу отдаёт данные и
     * `isLoading === false`, поэтому синхронизация переносит в состояние уже
     * правильные значения, а не пустую сетку со скелетоном.
     *
     * Проверено запуском: с одним лишь `setQueryData` серверная разметка
     * оставалась со скелетоном и «0 товара» в счётчике.
     */
    initialData: options.ssrProducts ?? undefined,
    queryFn: async () => {
      // ✅ Загружаем товары с рейтингами (avg_rating, review_count)
      const result = await productsStore.fetchProducts(
        catalogFilters.value,
        1,
        BRAND_PAGE_SIZE,
      )
      return result.products
    },
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000, // 2 минуты — показываем кеш, обновляем в фоне
    gcTime: 10 * 60 * 1000, // 10 минут в памяти
    retry: false,
    refetchOnWindowFocus: true,
    /*
     * `true`, а не `'always'`: с `'always'` запрос уходит сразу после
     * монтирования, хотя те же данные только что пришли с сервера. На
     * категории это давало рассинхрон гидратации — сервер рисовал кнопку
     * обычной, клиент к моменту гидратации уже был в состоянии загрузки.
     */
    refetchOnMount: true,
    refetchOnReconnect: false,
  })

  // Синхронизируем query → products
  watch(
    () => query.data.value,
    (data) => {
      if (data) {
        products.value = data

        // Calculate price range from first load
        if (!priceRangeInitialized && data.length > 0) {
          const prices = data.map(p => Number(p.price)).filter(p => p > 0)
          if (prices.length > 0) {
            const min = Math.floor(Math.min(...prices) / 100) * 100
            const max = Math.ceil(Math.max(...prices) / 100) * 100
            priceRange.value = { min: min || 0, max: max || 50000 }
            priceFilter.value = [priceRange.value.min, priceRange.value.max]
            localPrice.value = [priceRange.value.min, priceRange.value.max]
            priceRangeInitialized = true
          }
        }
      }
    },
    { immediate: true },
  )

  // Синхронизируем isLoading
  watch(
    () => query.isLoading.value,
    (val) => {
      isLoading.value = val
    },
    { immediate: true },
  )

  // Обратная совместимость — вызывается из страниц, но теперь query сам обновляется
  function loadProducts() {
    query.refetch()
  }

  // ── Load filter metadata ──
  async function loadFilterData() {
    await Promise.allSettled([
      productsStore.fetchAllMaterials().then(() => {
        availableMaterials.value = productsStore.allMaterials
      }),
      productsStore.fetchAllCountries().then(() => {
        availableCountries.value = productsStore.allCountries
      }),
    ])
  }

  // ── Active filter count ──
  const activeFiltersCount = computed(() => {
    let count = 0
    if (!hideProductLines.value)
      count += selectedProductLineIds.value.length
    count += selectedMaterialIds.value.length
    count += selectedCountryIds.value.length
    if (
      priceFilter.value[0] > priceRange.value.min
      || priceFilter.value[1] < priceRange.value.max
    ) {
      count++
    }
    return count
  })

  // ── Reset ──
  function resetFilters() {
    selectedProductLineIds.value = []
    selectedMaterialIds.value = []
    selectedCountryIds.value = []
    priceFilter.value = [priceRange.value.min, priceRange.value.max]
    localPrice.value = [priceRange.value.min, priceRange.value.max]
  }

  // ── Toggle helpers ──
  function toggleProductLine(id: string) {
    const idx = selectedProductLineIds.value.indexOf(id)
    if (idx >= 0)
      selectedProductLineIds.value.splice(idx, 1)
    else selectedProductLineIds.value.push(id)
  }

  function toggleMaterial(id: string) {
    const idx = selectedMaterialIds.value.indexOf(id)
    if (idx >= 0)
      selectedMaterialIds.value.splice(idx, 1)
    else selectedMaterialIds.value.push(id)
  }

  function toggleCountry(id: string) {
    const idx = selectedCountryIds.value.indexOf(id)
    if (idx >= 0)
      selectedCountryIds.value.splice(idx, 1)
    else selectedCountryIds.value.push(id)
  }

  function commitPrice(val: number[]) {
    if (Array.isArray(val) && val.length === 2) {
      priceFilter.value = val as [number, number]
    }
  }

  // TanStack Query автоматически refetch при изменении queryKey (фильтры/сортировка)

  return {
    products,
    isLoading,
    sortBy,
    mobileFiltersOpen,

    // Filter values
    selectedProductLineIds,
    selectedMaterialIds,
    selectedCountryIds,
    priceFilter,
    localPrice,

    // Filter metadata
    priceRange,
    availableProductLines,
    availableMaterials,
    availableCountries,
    activeFiltersCount,

    // Context
    hideBrands,
    hideProductLines,

    // Methods
    loadProducts,
    loadFilterData,
    resetFilters,
    toggleProductLine,
    toggleMaterial,
    toggleCountry,
    commitPrice,
  }
}

export type BrandFilterState = ReturnType<typeof useBrandPageFilters>
