import type { Database, ProductRow } from '@/types'
import { useAuthStore } from '../auth'

export const useRecommendationsStore = defineStore('recommendationsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const recommendedProducts = ref<ProductRow[]>([])
  const isLoading = ref(false)
  const hasPersonalizedRecommendations = ref(false)

  async function fetchRecommendations() {
    hasPersonalizedRecommendations.value = false
    if (!authStore.user?.id) {
      recommendedProducts.value = []
      return
    }
    isLoading.value = true
    try {
      const { data, error } = await supabase.rpc('get_personalized_recommendations', {
        p_user_id: authStore.user?.id,
      })

      if (error)
        throw error

      const result = data || []
      recommendedProducts.value = result

      if (result.length > 0) {
        hasPersonalizedRecommendations.value = true
      }
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
    hasPersonalizedRecommendations,
    fetchRecommendations,
  }
})
