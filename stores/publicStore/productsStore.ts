import type { Database, IProductFilters, ProductRow, ProductWithCategory } from '@/types'
import { toast } from 'vue-sonner'

export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const products = ref<ProductRow[]>([])
  const currentProduct = ref<ProductWithCategory | null>(null)
  const isLoading = ref(false)

  /**
   * Динамически вычисляет минимальную и максимальную цену из текущего
   * списка загруженных товаров (`products`).
   * Используется для настройки слайдера цен в фильтрах.
   */

  const priceRange = computed(() => {
    if (products.value.length === 0) {
      return { min: 0, max: 50000 }
    }
    const prices = products.value.map(p => Number(p.price))
    return {
      min: Math.floor(Math.min(...prices)),
      max: Math.ceil(Math.max(...prices)),
    }
  })

  /**
   * Загружает список товаров с применением фильтров, вызывая RPC-функцию в Supabase.
   * @param filters - Объект с параметрами фильтрации.
   * @returns Promise, который разрешается массивом найденных товаров.
   */

  async function fetchProducts(filters: IProductFilters): Promise<ProductRow[]> {
    isLoading.value = true
    products.value = []
    try {
      const { data, error } = await supabase
        .rpc('get_filtered_products', {
          p_category_slug: filters.categorySlug,
          p_subcategory_ids: filters.subCategoryIds,
          p_price_min: filters.priceMin,
          p_price_max: filters.priceMax,
          p_sort_by: filters.sortBy,
        })

      if (error)
        throw error

      const result = data || []
      products.value = result
      return result
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров', { description: error.message })
      return []
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Загружает один конкретный товар по его `slug`.
   * @param slug - Уникальный URL-идентификатор товара.
   * @returns Promise, который разрешается объектом товара или `null`, если не найден.
   */

  async function fetchProductBySlug(slug: string): Promise<ProductWithCategory | null> {
    isLoading.value = true
    currentProduct.value = null
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug)')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116')
        throw error

      currentProduct.value = data
      return data
    }
    catch (error: any) {
      toast.error(`Ошибка загрузки товара`, { description: error.message })
      return null
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    products,
    currentProduct,
    isLoading,
    priceRange,
    fetchProducts,
    fetchProductBySlug,
  }
})
