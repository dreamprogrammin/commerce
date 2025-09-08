import type { Database, ProductRow } from '@/types'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../auth'

export const useRecommendationsStore = defineStore('recommendationsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const recommendedProducts = ref<ProductRow[]>([])
  const isLoading = ref(false)
  const hasPersonalizedRecommendations = ref(false)
  const hasBeenFetched = ref(false)

  let fetchedForUserId: string | null = null

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

  async function fetchRecommendationsIfNeeded() {
    const currentUserId = authStore.user?.id || null
    if (hasBeenFetched.value && currentUserId === fetchedForUserId)
      return

    recommendedProducts.value = []
    hasPersonalizedRecommendations.value = false

    if (!currentUserId) {
      hasBeenFetched.value = true
      fetchedForUserId = null
      return
    }
    isLoading.value = true
    try {
      const { data, error } = await supabase.rpc('get_personalized_recommendations', {
        p_user_id: currentUserId,
      })

      if (error)
        throw error

      const result = data || []
      recommendedProducts.value = result
      hasPersonalizedRecommendations.value = result.length > 0

      hasBeenFetched.value = true
      fetchedForUserId = currentUserId
    }
    catch (e: any) {
      toast.error('Ошибка при загрузке рекомендаций:', e)
    }
    finally {
      isLoading.value = false
    }
  }

  function invalidateRecommendations() {
    hasBeenFetched.value = false
    fetchedForUserId = null
    console.warn('Кэш рекомендаций инвалидирован.')
  }

  return {
    recommendedProducts,
    isLoading,
    hasPersonalizedRecommendations,
    fetchRecommendations,
    fetchRecommendationsIfNeeded,
    invalidateRecommendations,
  }
})
