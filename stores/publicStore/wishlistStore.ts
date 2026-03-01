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
  async function fetchWishlistProducts(limit?: number) {
    // Выходим, если нет залогиненного пользователя
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      wishlistProductIds.value = []
      wishlistProducts.value = []
      return
    }

    isLoading.value = true
    try {
      // 1. Получаем ID избранных товаров пользователя (с лимитом если указан)
      let query = supabase
        .from('wishlist')
        .select('product_id')
        .eq('user_id', authStore.user.id)
        .order('created_at', { ascending: false })

      // ✅ Добавляем лимит если передан (для оптимизации)
      if (limit) {
        query = query.limit(limit)
      }

      const { data: idsData, error: idsError } = await query
      if (idsError)
        throw idsError

      const productIds = idsData.map(item => item.product_id)

      // Если лимит не задан, обновляем полный список ID
      if (!limit) {
        wishlistProductIds.value = productIds
      }

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

  // --- ИНИЦИАЛИЗАЦИЯ (Только ID, без полных данных товаров) ---
  async function fetchWishlistIds() {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      wishlistProductIds.value = []
      return
    }

    const { data, error } = await supabase
      .from('wishlist')
      .select('product_id')
      .eq('user_id', authStore.user.id)

    if (!error && data) {
      wishlistProductIds.value = data.map(item => item.product_id)
    }
  }

  // --- ЗАПИСЬ (Toggle: Добавить/Удалить) ---
  async function toggleWishlist(productId: string, productName: string) {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      return
    }

    const isCurrentlyInWishlist = wishlistProductIds.value.includes(productId)

    // OPTIMISTIC UPDATE: сразу меняем стейт, не дожидаясь сервера
    if (isCurrentlyInWishlist) {
      wishlistProductIds.value = wishlistProductIds.value.filter(id => id !== productId)
      wishlistProducts.value = wishlistProducts.value.filter(p => p.id !== productId)
    }
    else {
      wishlistProductIds.value = [...wishlistProductIds.value, productId]
    }

    try {
      if (isCurrentlyInWishlist) {
        const { error } = await supabase.from('wishlist').delete().match({ user_id: authStore.user.id, product_id: productId })
        if (error)
          throw error
        toast.success(`Товар "${productName}" удален из избранного.`)
      }
      else {
        const { error } = await supabase.from('wishlist').insert({ user_id: authStore.user.id, product_id: productId })
        // Игнорируем 23505 — товар уже в базе (рассинхрон вкладок)
        if (error && error.code !== '23505')
          throw error
        toast.success(`Товар "${productName}" добавлен в избранное.`)
      }
    }
    catch (error: any) {
      // ROLLBACK: откатываем оптимистичное обновление при ошибке
      if (isCurrentlyInWishlist) {
        wishlistProductIds.value = [...wishlistProductIds.value, productId]
      }
      else {
        wishlistProductIds.value = wishlistProductIds.value.filter(id => id !== productId)
        wishlistProducts.value = wishlistProducts.value.filter(p => p.id !== productId)
      }
      toast.error('Ошибка при обновлении избранного', {
        description: error?.message || 'Неизвестная ошибка',
      })
    }
  }

  return {
    wishlistProducts,
    wishlistProductIds,
    isLoading,
    fetchWishlistIds,
    fetchWishlistProducts,
    toggleWishlist,
    isProductInWishlist: computed(() => (id: string) => wishlistProductIds.value.includes(id)),
  }
})
