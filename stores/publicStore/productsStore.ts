import type { Database, IProductFilters, ProductRow, ProductWithCategory } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'

// Этот стор больше не хранит состояние (state) для продуктов.
// Он работает как типизированный API-клиент.
// Состояние (products, currentProduct, isLoading) будет храниться
// локально на страницах, которые его используют.
// Это решает проблемы с "мельканием" UI и "грязным" состоянием.
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

  /**
   * Загружает отфильтрованный и отсортированный список товаров с пагинацией.
   * НЕ изменяет никакое состояние, а просто ВОЗВРАЩАЕТ результат.
   * @param filters - Объект с параметрами фильтрации.
   * @param loadMore - Флаг, управляющий пагинацией.
   * @param currentPage - Текущая страница для дозагрузки.
   * @param pageSize - Размер страницы.
   * @returns Promise, который разрешается объектом с товарами и флагом `hasMore`.
   */
  async function fetchProducts(
    filters: IProductFilters,
    currentPage = 1,
    pageSize = 12,
  ): Promise<{ products: ProductRow[], hasMore: boolean }> {
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

      const newProducts = data || []
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
  async function fetchProductBySlug(slug: string): Promise<ProductWithCategory | null> {
    if (import.meta.dev) {
      await delay(2000)
    }
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug)')
        .eq('slug', slug)
        .eq('is_active', true)
        .single()

      if (error && error.code !== 'PGRST116')
        throw error

      return data
    }
    catch (error: any) {
      toast.error(`Ошибка загрузки товара`, { description: error.message })
      return null
    }
  }

  /**
   * Находит один "Товар дня" - активный товар с максимальным количеством бонусных баллов.
   */
  async function fetchFeaturedProduct(): Promise<ProductWithCategory | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*, categories(name, slug)')
        .eq('is_active', true)
        .not('image_url,', 'is', null)
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

  async function fetchNewestProducts(limit: number = 10): Promise<ProductRow[]> {
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: true })
        .limit(limit)

      if (error)
        throw error
      return data || []
    }
    catch (e: any) {
      toast.error('Ошибка при загрузке новинок', { description: e.message })
      return []
    }
  }

  async function fetchPopularProducts(limit: number = 10): Promise<ProductRow[]> {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .order('sales_count', { ascending: true })
        .limit(limit)

      if (error)
        throw error

      return data || []
    }
    catch (e: any) {
      toast.error('Не удалось загрузить популярные товары', { description: e.message })
      return []
    }
  }

  // Возвращаем только функции, никакого состояния.
  return {
    fetchProducts,
    fetchProductBySlug,
    fetchFeaturedProduct,
    fetchNewestProducts,
    fetchPopularProducts,
  }
})
