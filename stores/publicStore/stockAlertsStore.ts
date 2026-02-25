import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../auth'

export const useStockAlertsStore = defineStore('stockAlertsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const subscribedProductIds = ref<string[]>([])
  const isLoading = ref(false)

  async function fetchSubscriptions() {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      subscribedProductIds.value = []
      return
    }

    try {
      const { data, error } = await supabase
        .from('stock_alerts')
        .select('product_id')
        .eq('user_id', authStore.user.id)

      if (error)
        throw error
      subscribedProductIds.value = (data || []).map(d => d.product_id)
    }
    catch (e: any) {
      console.error('Ошибка загрузки подписок на поступление:', e.message)
    }
  }

  async function toggleAlert(productId: string) {
    if (!authStore.isLoggedIn) {
      toast.info('Авторизуйтесь, чтобы подписаться на уведомление о поступлении')
      return
    }

    isLoading.value = true
    try {
      const { data, error } = await supabase.rpc('toggle_stock_alert', {
        p_product_id: productId,
      })

      if (error)
        throw error

      const result = data as unknown as { subscribed: boolean, error?: string }

      if (result.error) {
        toast.error(result.error)
        return
      }

      if (result.subscribed) {
        subscribedProductIds.value.push(productId)
        toast.success('Вы подписались на уведомление о поступлении')
      }
      else {
        subscribedProductIds.value = subscribedProductIds.value.filter(id => id !== productId)
        toast.info('Подписка на уведомление отменена')
      }
    }
    catch (e: any) {
      toast.error('Ошибка', { description: e.message })
    }
    finally {
      isLoading.value = false
    }
  }

  const isSubscribed = computed(() => (productId: string) =>
    subscribedProductIds.value.includes(productId),
  )

  return {
    subscribedProductIds,
    isLoading,
    fetchSubscriptions,
    toggleAlert,
    isSubscribed,
  }
})
