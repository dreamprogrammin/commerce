import type { Database, RecommendedProduct } from '@/types'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../auth'

export const useRecommendationsStore = defineStore('recommendationsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  async function fetchRecommendations(): Promise<RecommendedProduct[]> {
    if (!authStore.user?.id) {
      return []
    }

    try {
      const { data, error } = await supabase
        .rpc('get_personalized_recommendations', {
          p_user_id: authStore.user.id,
        })
      if (error)
        throw error

      // TypeScript теперь будет счастлив
      return (data as RecommendedProduct[]) || []
    }
    catch (e: any) {
      toast.error('Ошибка при загрузке рекомендаций', { description: e.message })
      return []
    }
  }

  return {
    fetchRecommendations,
  }
})
