import type { AccessoryProduct, AttributeWithValue, Brand, BrandForFilter, Country, Database, FullProduct, IProductFilters, Material, ProductRow, ProductWithGallery, ProductWithImages, SimpleBrand } from '@/types'
import { toast } from 'vue-sonner'

export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

  // ============================================
  // 🔥 STATE - КЭШИРОВАНИЕ МЕТАДАННЫХ
  // ============================================
  const brands = ref<Brand[]>([])
  const brandsByCategory = ref<Record<string, BrandForFilter[]>>({})
  const attributesByCategory = ref<Record<string, AttributeWithValue[]>>({})
  const allMaterials = ref<Material[]>([])
  const allCountries = ref<Country[]>([])
  const priceRangeByCategory = ref<Record<string, { min_price: number, max_price: number }>>({})

  // ============================================
  // 📦 МЕТОДЫ С КЭШИРОВАНИЕМ
  // ============================================

  async function fetchAllBrands() {
    if (brands.value.length > 0) {
      console.warn('✅ All brands from cache')
      return
    }
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name', { ascending: true })
      if (error)
        throw error
      brands.value = data || []
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке брендов', { description: error.message })
    }
  }

  async function fetchBrandsForCategory(categorySlug: string): Promise<BrandForFilter[]> {
    if (!categorySlug || categorySlug === 'all')
      return []

    // Проверяем кэш
    if (brandsByCategory.value[categorySlug]) {
      console.warn('✅ Brands from cache:', categorySlug)
      return brandsByCategory.value[categorySlug]
    }

    console.warn('🌐 Fetching brands from server:', categorySlug)

    try {
      const { data, error } = await supabase.rpc('get_brands_by_category_slug', {
        p_category_slug: categorySlug,
      })
      if (error)
        throw error

      brandsByCategory.value[categorySlug] = data || []
      return data || []
    }
    catch (error: any) {
      console.error('Ошибка загрузки брендов для категории:', error)
      return []
    }
  }

  async function fetchAttributesForCategory(categorySlug: string): Promise<AttributeWithValue[]> {
    if (!categorySlug || categorySlug === 'all')
      return []

    // Проверяем кэш
    if (attributesByCategory.value[categorySlug]) {
      console.warn('✅ Attributes from cache:', categorySlug)
      return attributesByCategory.value[categorySlug]
    }

    console.warn('🌐 Fetching attributes from server:', categorySlug)

    try {
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('slug', categorySlug)
        .single()
      if (categoryError)
        throw categoryError

      const { data, error } = await supabase
        .from('attributes')
        .select('*, attribute_options(*), category_attributes!inner(category_id)')
        .eq('category_attributes.category_id', categoryData.id)
        .order('name')

      if (error)
        throw error

      attributesByCategory.value[categorySlug] = data || []
      return data || []
    }
    catch (error: any) {
      console.error('Ошибка загрузки атрибутов для фильтров:', error)
      return []
    }
  }

  async function fetchAllMaterials(): Promise<Material[]> {
    if (allMaterials.value.length > 0) {
      console.warn('✅ Materials from cache')
      return allMaterials.value
    }

    console.warn('🌐 Fetching materials from server')

    try {
      const { data, error } = await supabase.from('materials').select('*').order('name')
      if (error)
        throw error
      allMaterials.value = data || []
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке материалов', { description: error.message })
      return []
    }
  }

  async function fetchAllCountries(): Promise<Country[]> {
    if (allCountries.value.length > 0) {
      console.warn('✅ Countries from cache')
      return allCountries.value
    }

    console.warn('🌐 Fetching countries from server')

    try {
      const { data, error } = await supabase.from('countries').select('*').order('name')
      if (error)
        throw error
      allCountries.value = data || []
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке стран', { description: error.message })
      return []
    }
  }

  async function fetchPriceRangeForCategory(categorySlug: string): Promise<{ min_price: number, max_price: number }> {
    if (!categorySlug || categorySlug === 'all') {
      return { min_price: 0, max_price: 50000 }
    }

    // Проверяем кэш
    if (priceRangeByCategory.value[categorySlug]) {
      console.warn('✅ Price range from cache:', categorySlug)
      return priceRangeByCategory.value[categorySlug]
    }

    console.warn('🌐 Fetching price range from server:', categorySlug)

    try {
      const { data, error } = await supabase
        .rpc('get_category_price_range', { p_category_slug: categorySlug })
        .overrideTypes<{ min_price: number, max_price: number }[]>()

      if (error)
        throw error

      const range = data && data.length > 0 ? data[0] : null
      const result = {
        min_price: Number(range?.min_price || 0),
        max_price: Number(range?.max_price || 50000),
      }

      priceRangeByCategory.value[categorySlug] = result
      return result
    }
    catch (error: any) {
      console.error('Ошибка при получении диапазона цен:', error)
      toast.error('Ошибка при загрузке диапазона цен', { description: error.message })
      return { min_price: 0, max_price: 50000 }
    }
  }

  // ============================================
  // 🧹 УПРАВЛЕНИЕ КЭШЕМ
  // ============================================

  function clearCache() {
    brandsByCategory.value = {}
    attributesByCategory.value = {}
    allMaterials.value = []
    allCountries.value = []
    priceRangeByCategory.value = {}
    brands.value = []
    console.warn('🧹 All cache cleared')
  }

  function clearCategoryCache(categorySlug: string) {
    delete brandsByCategory.value[categorySlug]
    delete attributesByCategory.value[categorySlug]
    delete priceRangeByCategory.value[categorySlug]
    console.warn('🧹 Cache cleared for category:', categorySlug)
  }

  function invalidateBrandsCache() {
    brandsByCategory.value = {}
    brands.value = []
    console.warn('🧹 Brands cache invalidated')
  }

  function invalidateMaterialsCache() {
    allMaterials.value = []
    console.warn('🧹 Materials cache invalidated')
  }

  function invalidateCountriesCache() {
    allCountries.value = []
    console.warn('🧹 Countries cache invalidated')
  }

  // ============================================
  // 📊 МЕТОДЫ БЕЗ КЭШИРОВАНИЯ (товары)
  // ============================================

  async function fetchProducts(
    filters: IProductFilters,
    currentPage = 1,
    pageSize = 12,
  ): Promise<{ products: ProductWithGallery[], hasMore: boolean }> {
    try {
      const { data: rpcResponse, error } = await supabase.rpc('get_filtered_products', {
        p_category_slug: filters.categorySlug,
        p_subcategory_ids: filters.subCategoryIds,
        p_brand_ids: filters.brandIds,
        p_price_min: filters.priceMin,
        p_price_max: filters.priceMax,
        p_sort_by: filters.sortBy,
        p_page_size: pageSize,
        p_page_number: currentPage,
        p_country_ids: filters.countryIds,
        p_material_ids: filters.materialIds,
        p_attributes: filters.attributes,
      })

      if (error)
        throw error

      const newProducts = (rpcResponse || []).map((p) => {
        return {
          ...p,
          product_images: Array.isArray(p.product_images) ? p.product_images : [],
          brands: p.brand_name
            ? {
                id: p.brand_id,
                name: p.brand_name,
                slug: p.brand_slug,
              } as SimpleBrand
            : null,
        }
      }) as unknown as ProductWithGallery[]

      const hasMore = newProducts.length === pageSize
      return { products: newProducts, hasMore }
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров', { description: error.message })
      return { products: [], hasMore: false }
    }
  }

  async function fetchProductBySlug(slug: string): Promise<FullProduct | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
          *,
          categories(name, slug),
          product_images(*),
          brands(*),
          countries(*),
          materials(*),
          product_attribute_values(*, attributes(*, attribute_options(*)))
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116')
        throw error
      return data as FullProduct | null
    }
    catch (error: any) {
      toast.error('Ошибка загрузки товара', { description: error.message })
      return null
    }
  }

  async function fetchProductsByIds(ids: string[]): Promise<ProductWithImages[]> {
    if (!ids || ids.length === 0)
      return []
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(*)')
        .in('id', ids)
        .eq('is_active', true)

      if (error)
        throw error
      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки связанных товаров', { description: error.message })
      return []
    }
  }

  async function fetchFeaturedProducts(limit: number = 5): Promise<FullProduct[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug), product_images(*)')
        .eq('is_active', true)
        .eq('is_featured', true) // 🎯 Только избранные
        .order('featured_order', { ascending: true }) // 🎯 По порядку
        .limit(limit)

      if (error)
        throw error

      // 🔄 Fallback: если избранных нет - берём по бонусам
      if (!data || data.length === 0) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('products')
          .select('*, categories(name, slug), product_images(*)')
          .eq('is_active', true)
          .order('bonus_points_award', { ascending: false })
          .limit(limit)

        if (fallbackError)
          throw fallbackError
        return (fallbackData as FullProduct[]) || []
      }

      return (data as FullProduct[]) || []
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров дня', { description: error.message })
      return []
    }
  }

  async function fetchNewestProducts(limit: number = 10): Promise<ProductWithGallery[]> {
    const { products } = await fetchProducts(
      {
        categorySlug: 'all',
        sortBy: 'newest',
      },
      1,
      limit,
    )
    return products
  }

  async function fetchPopularProducts(limit: number = 10): Promise<ProductWithGallery[]> {
    const { products } = await fetchProducts(
      {
        categorySlug: 'all',
        sortBy: 'popularity',
      },
      1,
      limit,
    )
    return products
  }

  async function fetchSimilarProducts(
    categoryId: string | null,
    excludeIds: string[],
    limit?: number,
  ): Promise<AccessoryProduct[]> {
    if (!categoryId || !Array.isArray(excludeIds) || excludeIds.length === 0) {
      return []
    }

    try {
      let query = supabase
        .from('products')
        .select('*, product_images(*)')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .not('id', 'in', `(${excludeIds.join(',')})`)

      if (limit && limit > 0) {
        query = query.limit(limit)
      }
      const { data, error } = await query
      if (error)
        throw error

      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке похожих товаров', { description: error.message })
      return []
    }
  }

  async function getProductById(productId: string): Promise<ProductRow | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', productId)
        .single()
      if (error)
        throw error
      return data
    }
    catch (error) {
      console.error('Ошибка загрузки продукта по ID', error)
      return null
    }
  }

  // ============================================
  // 📤 RETURN
  // ============================================

  return {
    // State
    brands,
    brandsByCategory,
    attributesByCategory,
    allMaterials,
    allCountries,
    priceRangeByCategory,

    // Методы
    fetchAllBrands,
    fetchProducts,
    fetchProductBySlug,
    fetchFeaturedProducts,
    fetchNewestProducts,
    fetchPopularProducts,
    fetchSimilarProducts,
    fetchProductsByIds,
    fetchBrandsForCategory,
    fetchAttributesForCategory,
    getProductById,
    fetchPriceRangeForCategory,
    fetchAllMaterials,
    fetchAllCountries,

    // Управление кэшем
    clearCache,
    clearCategoryCache,
    invalidateBrandsCache,
    invalidateMaterialsCache,
    invalidateCountriesCache,
  }
})
