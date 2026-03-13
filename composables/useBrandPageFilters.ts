import type { Country, IProductFilters, Material, ProductLine, ProductWithGallery, SortByType } from '@/types'
import { useQuery } from '@tanstack/vue-query'
import { useProductsStore } from '@/stores/publicStore/productsStore'

export type BrandPageContext = 'brand' | 'line'

interface UseBrandPageFiltersOptions {
  brandId: Ref<string | undefined>
  productLineId?: Ref<string | undefined>
  context: BrandPageContext
  brandProductLines?: Ref<ProductLine[]>
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
  const queryKey = computed(() => {
    const f = catalogFilters.value
    return [
      'brand-page-products',
      options.context,
      f.brandIds?.join(',') || '',
      f.productLineIds?.join(',') || '',
      f.sortBy,
      f.materialIds?.join(',') || '',
      f.countryIds?.join(',') || '',
      `${f.priceMin ?? 0}-${f.priceMax ?? 0}`,
    ]
  })

  const queryEnabled = computed(() => !!options.brandId.value)

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const result = await productsStore.fetchProducts(catalogFilters.value, 1, 200)
      return result.products
    },
    enabled: queryEnabled,
    staleTime: 2 * 60 * 1000, // 2 минуты — показываем кеш, обновляем в фоне
    gcTime: 10 * 60 * 1000, // 10 минут в памяти
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
  })

  // Синхронизируем query → products
  watch(() => query.data.value, (data) => {
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
  }, { immediate: true })

  // Синхронизируем isLoading
  watch(() => query.isLoading.value, (val) => {
    isLoading.value = val
  }, { immediate: true })

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
