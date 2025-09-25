import type { AccessoryProduct, Database, FullProduct, IProductFilters, ProductWithGallery } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

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
      const { data, error } = await supabase.rpc('get_filtered_products', {
        p_category_slug: filters.categorySlug,
        p_subcategory_ids: filters.subCategoryIds,
        p_price_min: filters.priceMin,
        p_price_max: filters.priceMax,
        p_sort_by: filters.sortBy,
        p_page_size: pageSize,
        p_page_number: currentPage,
      })

      if (error)
        throw error

      const newProducts = data as ProductWithGallery[] || []
      // Определяем, есть ли еще страницы для загрузки
      const hasMore = newProducts.length === pageSize

      return { products: newProducts, hasMore }
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров', { description: error.message })
      // В случае ошибки возвращаем пустой результат
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
    if (import.meta.dev) {
      await delay(2000)
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select(`
        *,
        categories(name, slug),
        product_images(*),
        product_accessories(
          *,
          accessory:products(
            *,
            product_images(*)
          )
        )
      `)
        .eq('slug', slug)
        .eq('is_active', true)
        .order('display_order', { referencedTable: 'product_images' })
        .single()

      if (error && error.code !== 'PGRST116')
        throw error

      return data as FullProduct | null
    }
    catch (error: any) {
      toast.error(`Ошибка загрузки товара`, { description: error.message })
      return null
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

      return data
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
   * @param currentProductId - ID текущего товара, чтобы исключить его из списка.
   * @param limit - Количество товаров для загрузки.
   * @returns Promise, который разрешается массивом товаров.
   */
  async function fetchSimilarProducts(
    categoryId: string | null,
    currentProductId: string,
    limit: number = 4,
  ): Promise<AccessoryProduct[]> {
    if (!categoryId)
      return [] // Если у товара нет категории, ничего не возвращаем

    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, product_images(*)')
        .eq('category_id', categoryId)
        .eq('is_active', true)
        .neq('id', currentProductId)
        .limit(limit)

      if (error)
        throw error

      return data || []
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке похожих товаров', { description: error.message })
      return []
    }
  }
  return {
    fetchProducts,
    fetchProductBySlug,
    fetchFeaturedProduct,
    fetchNewestProducts,
    fetchPopularProducts,
    fetchSimilarProducts,
  }
})
