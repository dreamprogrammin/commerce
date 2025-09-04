import type { Database, ProductRow } from '@/types'
import { useAuthStore } from '../auth'

export const useRecommendationsStore = defineStore('recommendationsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const recommendedProducts = ref<ProductRow[]>([])
  const isLoading = ref(false)

  async function fetchRecommendations() {
    isLoading.value = true
    try {
      const { data, error } = await supabase.rpc('get_recommended_products', {
        p_user_id: authStore.user?.id,
      })

      if (error)
        throw error

      recommendedProducts.value = data || []
    }
    catch (e: any) {
      console.error('Ошибка при загрузке рекомендаций:', e)
      recommendedProducts.value = []
    }
    finally {
      isLoading.value = false
    }
  }

  return {
    recommendedProducts,
    isLoading,
    fetchRecommendations,
  }
})
