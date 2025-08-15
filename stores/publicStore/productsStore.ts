import type { Database, IProductFilters, ProductRow, ProductWithCategory } from '@/types'
import { toast } from 'vue-sonner'

export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const products = ref<ProductRow[]>([])
  const currentProduct = ref<ProductWithCategory | null>(null)
  const isLoading = ref(false)
  const isLoadingMore = ref(false)
  const currentPage = ref(1)
  /**
   * Флаг, который показывает, есть ли еще товары для загрузки.
   * Когда он станет `false`, мы скроем кнопку "Показать ещё".
   */
  const hasMoreProducts = ref(true)
  /**
   * Константа, определяющая, сколько товаров загружать за один раз.
   */
  const PAGE_SIZE = 12
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

  console.log(products.value)

  /**
   * Загружает список товаров с применением фильтров, вызывая RPC-функцию в Supabase.
   * @param filters - Объект с параметрами фильтрации.
   * @returns Promise, который разрешается массивом найденных товаров.
   */

  async function fetchProducts(filters: IProductFilters, loadMore = false) {
    if (loadMore) {
      isLoadingMore.value = true
    }
    else {
      isLoading.value = true
      // При полной перезагрузке сбрасываем все состояние пагинации
      products.value = []
      currentPage.value = 1
      hasMoreProducts.value = true
    }
    try {
      const { data, error } = await supabase
        .rpc('get_filtered_products', {
          p_category_slug: filters.categorySlug,
          p_subcategory_ids: filters.subCategoryIds,
          p_price_min: filters.priceMin,
          p_price_max: filters.priceMax,
          p_sort_by: filters.sortBy,
          p_page_size: PAGE_SIZE,
          p_page_number: currentPage.value,
        })

      if (error)
        throw error
      const newProducts = data || []

      if (loadMore) {
        // РЕЖИМ ДОЗАГРУЗКИ: Добавляем новые товары в конец существующего списка.
        products.value.push(...newProducts)
      }
      else {
        // РЕЖИМ ПЕРЕЗАГРУЗКИ: Полностью заменяем список.
        products.value = newProducts
      }

      // Если сервер вернул меньше товаров, чем мы просили (PAGE_SIZE),
      // это значит, что мы достигли конца списка.
      if (newProducts.length < PAGE_SIZE) {
        hasMoreProducts.value = false
      }

      // Готовимся к следующему запросу "Показать ещё"
      currentPage.value++
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров', { description: error.message })
      hasMoreProducts.value = false
    }
    finally {
      isLoading.value = false
      isLoadingMore.value = false
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
    isLoadingMore,
    hasMoreProducts,
    priceRange,
    fetchProducts,
    fetchProductBySlug,
  }
})
