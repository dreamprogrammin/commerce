import type { Database } from '@/types'
import { toast } from 'vue-sonner'

interface BroadcastRecord {
  id: string
  admin_id: string
  message: string
  sent_count: number
  failed_count: number
  created_at: string
}

export const useAdminBroadcastStore = defineStore('adminBroadcastStore', () => {
  const supabase = useSupabaseClient<Database>()

  const subscriberCount = ref(0)
  const isLoadingCount = ref(false)
  const isSending = ref(false)
  const history = ref<BroadcastRecord[]>([])
  const isLoadingHistory = ref(false)

  async function fetchSubscriberCount() {
    isLoadingCount.value = true
    try {
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .not('telegram_chat_id', 'is', null)

      if (error)
        throw error
      subscriberCount.value = count ?? 0
    }
    catch (error: any) {
      console.error('[BroadcastStore] Error fetching subscriber count:', error)
    }
    finally {
      isLoadingCount.value = false
    }
  }

  async function sendBroadcast(message: string, options?: { title?: string, link?: string }): Promise<boolean> {
    isSending.value = true
    try {
      const { data, error } = await supabase.functions.invoke('send-broadcast', {
        body: { message, title: options?.title, link: options?.link },
      })

      if (error)
        throw error

      const parts: string[] = []
      if (data.sent_count > 0)
        parts.push(`Telegram: ${data.sent_count}`)
      if (data.notified_count > 0)
        parts.push(`In-app: ${data.notified_count}`)

      toast.success(`Рассылка отправлена: ${parts.join(', ')}`, {
        description: data.failed_count > 0 ? `Не удалось: ${data.failed_count}` : undefined,
      })

      // Обновляем историю и счётчик
      await Promise.all([loadHistory(), fetchSubscriberCount()])

      return true
    }
    catch (error: any) {
      console.error('[BroadcastStore] Error sending broadcast:', error)
      toast.error('Ошибка отправки рассылки', {
        description: error.message,
      })
      return false
    }
    finally {
      isSending.value = false
    }
  }

  async function loadHistory() {
    isLoadingHistory.value = true
    try {
      const { data, error } = await supabase
        .from('telegram_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)

      if (error)
        throw error
      history.value = (data ?? []) as BroadcastRecord[]
    }
    catch (error: any) {
      console.error('[BroadcastStore] Error loading history:', error)
    }
    finally {
      isLoadingHistory.value = false
    }
  }

  return {
    subscriberCount,
    isLoadingCount,
    isSending,
    history,
    isLoadingHistory,
    fetchSubscriberCount,
    sendBroadcast,
    loadHistory,
  }
})
