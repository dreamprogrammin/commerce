import type { Database, IProductFilters, ProductRow, ProductWithCategory } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { toast } from 'vue-sonner'

export const useProductsStore = defineStore('productsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const products = ref<ProductRow[]>([])
  const currentProduct = ref<ProductWithCategory | null>(null)
  const isLoading = ref(false)
  const isLoadingMore = ref(false)
  const currentPage = ref(1)
  const hasMoreProducts = ref(true)
  const PAGE_SIZE = 12

  const priceRange = computed(() => {
    if (products.value.length === 0)
      return { min: 0, max: 50000 }
    const prices = products.value.map(p => Number(p.price))
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) }
  })

  async function fetchProducts(filters: IProductFilters, loadMore = false): Promise<ProductRow[]> {
    if (loadMore) {
      isLoadingMore.value = true
    }
    else {
      isLoading.value = true
      products.value = []
      currentPage.value = 1
      hasMoreProducts.value = true
    }

    // Защита от вызова без слага
    if (!filters.categorySlug) {
      console.warn('Попытка вызвать fetchProducts без categorySlug. Запрос отменен.')
      isLoading.value = false
      isLoadingMore.value = false
      return []
    }

    try {
      const { data, error } = await supabase.rpc('get_filtered_products', {
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
        products.value.push(...newProducts)
      }
      else {
        products.value = newProducts
      }

      if (newProducts.length < PAGE_SIZE) {
        hasMoreProducts.value = false
      }
      currentPage.value++
      return newProducts
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке товаров', { description: error.message })
      hasMoreProducts.value = false
      return []
    }
    finally {
      isLoading.value = false
      isLoadingMore.value = false
    }
  }

  async function fetchProductBySlug(slug: string): Promise<ProductWithCategory | null> { /* ... (код из предыдущих ответов) */ }

  return { products, currentProduct, isLoading, isLoadingMore, hasMoreProducts, priceRange, fetchProducts, fetchProductBySlug }
})
