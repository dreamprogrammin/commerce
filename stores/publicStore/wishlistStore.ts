import type { Database, ProductWithGallery } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../auth'
import { useProductsStore } from './productsStore'

export const useWishlistStore = defineStore('wishlistStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore() // Используем уже существующий AuthStore
  const productsStore = useProductsStore() // Используем ProductsStore

  const wishlistProductIds = ref<string[]>([]) // Только ID товаров в избранном
  const wishlistProducts = ref<ProductWithGallery[]>([]) // Сами объекты товаров
  const isLoading = ref(false)

  // --- ЧТЕНИЕ (Загрузка избранного) ---
  async function fetchWishlistProducts() {
    // Выходим, если нет залогиненного пользователя
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      wishlistProductIds.value = []
      wishlistProducts.value = []
      return
    }

    isLoading.value = true
    try {
      // 1. Получаем ID всех избранных товаров пользователя
      const { data: idsData, error: idsError } = await supabase
        .from('wishlist')
        .select('product_id')
        .eq('user_id', authStore.user.id)
      if (idsError)
        throw idsError

      const productIds = idsData.map(item => item.product_id)
      wishlistProductIds.value = productIds

      // 2. Если есть ID, загружаем сами товары
      if (productIds.length > 0) {
        // Мы используем ProductsStore для загрузки полных данных о товаре
        const productsData = await productsStore.fetchProductsByIds(productIds)
        wishlistProducts.value = productsData as ProductWithGallery[]
      }
      else {
        wishlistProducts.value = []
      }
    }
    catch (e: any) {
      toast.error('Ошибка загрузки избранного', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  // --- ЗАПИСЬ (Toggle: Добавить/Удалить) ---
  async function toggleWishlist(productId: string, productName: string) {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      toast.info('Пожалуйста, авторизуйтесь, чтобы добавлять в избранное.')
      return
    }

    const isCurrentlyInWishlist = wishlistProductIds.value.includes(productId)
    const method = isCurrentlyInWishlist ? 'delete' : 'insert'

    try {
      if (method === 'delete') {
        const { error } = await supabase.from('wishlist').delete().match({ user_id: authStore.user.id, product_id: productId })
        if (error)
          throw error
        toast.success(`Товар "${productName}" удален из избранного.`)
      }
      else {
        const { error } = await supabase.from('wishlist').insert({ user_id: authStore.user.id, product_id: productId })
        if (error)
          throw error
        toast.success(`Товар "${productName}" добавлен в избранное.`)
      }

      // Обновляем состояние после изменения (чтобы UI сразу обновился)
      await fetchWishlistProducts()
    }
    catch (error: any) {
      toast.error(`${error}'Ошибка при обновлении избранного`)
    }
  }

  return {
    wishlistProducts,
    wishlistProductIds,
    isLoading,
    fetchWishlistProducts,
    toggleWishlist,
    isProductInWishlist: computed(() => (id: string) => wishlistProductIds.value.includes(id)),
  }
})
