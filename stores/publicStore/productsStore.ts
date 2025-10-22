import type { AccessoryProduct, AttributeWithValue, Brand, BrandForFilter, Database, FilteredProductRpcResponse, FullProduct, IProductFilters, ProductRow, ProductWithGallery, ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'

// const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const brands = ref<Brand[]>([])

  async function fetchAllBrands() {
    if (brands.value.length > 0)
      return
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
  /**
   * Загружает отфильтрованный и отсортированный список товаров с пагинацией.
   * НЕ изменяет никакое состояние, а просто ВОЗВРАЩАЕТ результат.
   * @param filters - Объект с параметрами фильтрации.
   * @param currentPage - Текущая страница для дозагрузки.
   * @param pageSize - Размер страницы.
   * @returns Promise, который разрешается объектом с товарами и флагом `hasMore`.
   */
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
        p_attributes: filters.attributes,
      })

      if (error)
        throw error

      // Теперь TypeScript знает, что `data` - это массив `FilteredProductRpcResponse`
      const newProducts = (rpcResponse || []).map((p) => {
        // `p` теперь содержит p.brand_name и p.brand_slug
        return {
          ...p,
          product_images: Array.isArray(p.product_images) ? p.product_images : [],
          brands: p.brand_name
            ? {
                id: p.brand_id,
                name: p.brand_name,
                slug: p.brand_slug,
                // Заглушки, чтобы соответствовать полному типу Brand
                created_at: '',
                updated_at: '',
                description: null,
                logo_url: null,
              }
            : null,
        }
      }) as ProductWithGallery[]

      const hasMore = newProducts.length === pageSize
      return { products: newProducts, hasMore }
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров', { description: error.message })
      return { products: [], hasMore: false }
    }
  }
  /**
   * Загружает один конкретный товар по его `slug`.
   * НЕ изменяет никакое состояние, а просто ВОЗВРАЩАЕТ результат.
   * @param slug - Уникальный URL-идентификатор товара.
   * @returns Promise, который разрешается объектом товара или `null`.
   */
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

  /**
   * Загружает бренды, которые доступны в указанной категории.
   */
  async function fetchBrandsForCategory(categorySlug: string): Promise<BrandForFilter[]> {
    if (!categorySlug || categorySlug === 'all')
      return []
    try {
      const { data, error } = await supabase.rpc('get_brands_by_category_slug', {
        p_category_slug: categorySlug,
      })
      if (error)
        throw error

      // TypeScript теперь будет счастлив, так как data соответствует BrandForFilter[]
      return data || []
    }
    catch (error: any) {
      console.error('Ошибка загрузки брендов для категории:', error)
      return []
    }
  }
  /**
   * Загружает Атрибуты (и их опции), которые привязаны к указанной категории.
   */
  async function fetchAttributesForCategory(categorySlug: string): Promise<AttributeWithValue[]> {
    if (!categorySlug || categorySlug === 'all')
      return []
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
      return data || []
    }
    catch (error: any) {
      console.error('Ошибка загрузки атрибутов для фильтров:', error)
      return []
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

  /**
   * Находит один "Товар дня" - активный товар с максимальным количеством бонусных баллов.
   */
  async function fetchFeaturedProduct(): Promise<FullProduct | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug), product_images(*)')
        .eq('is_active', true)
        .order('bonus_points_award', { ascending: true })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116')
        throw error

      return data as FullProduct
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товара дня', { description: error.message })
      return null
    }
  }

  async function fetchNewestProducts(limit: number = 10): Promise<ProductWithGallery[]> {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

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

  /**
   * Загружает похожие товары на основе той же категории.
   * @param categoryId - ID категории для поиска.
   * @param excludeIds - Массив ID товаров, которые нужно исключить из результатов.
   * @param limit - Количество товаров для загрузки.
   * @returns Promise, который разрешается массивом товаров.
   */
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
        .select('*') // Загружаем все поля
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
  return {
    brands,
    fetchAllBrands,
    fetchProducts,
    fetchProductBySlug,
    fetchFeaturedProduct,
    fetchNewestProducts,
    fetchPopularProducts,
    fetchSimilarProducts,
    fetchProductsByIds,
    fetchBrandsForCategory,
    fetchAttributesForCategory,
    getProductById,
  }
})
