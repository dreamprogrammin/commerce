import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Database } from '@/types'
import { toast } from 'vue-sonner'

type Notification = Database['public']['Tables']['notifications']['Row']

export const useNotificationsStore = defineStore('notificationsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const unreadCount = ref(0)
  const notifications = ref<Notification[]>([])
  const isLoading = ref(false)
  let realtimeChannel: RealtimeChannel | null = null

  async function fetchUnreadCount() {
    if (!user.value)
      return
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.value.id)
      .eq('is_read', false)

    unreadCount.value = count ?? 0
  }

  async function fetchNotifications() {
    if (!user.value)
      return
    isLoading.value = true
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.value.id)
      .order('created_at', { ascending: false })
      .limit(20)

    notifications.value = data ?? []
    isLoading.value = false
  }

  async function markAsRead(id: string) {
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', id)

    const item = notifications.value.find(n => n.id === id)
    if (item && !item.is_read) {
      item.is_read = true
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
  }

  async function markAllAsRead() {
    if (!user.value)
      return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.value.id)
      .eq('is_read', false)

    notifications.value.forEach(n => n.is_read = true)
    unreadCount.value = 0
  }

  function subscribeToNotifications() {
    if (!user.value || realtimeChannel)
      return

    realtimeChannel = supabase
      .channel(`notifications:${user.value.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.value.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification

          // Добавляем уведомление в список
          notifications.value.unshift(newNotification)
          unreadCount.value++

          // Показываем toast уведомление для всех типов
          const actionLabel = newNotification.type === 'bonus_activated' ? 'Посмотреть' : 'Перейти'
          const duration = newNotification.type === 'bonus_activated' ? 7000 : 5000

          toast.success(newNotification.title, {
            description: newNotification.body ?? undefined,
            duration,
            action: newNotification.link
              ? {
                  label: actionLabel,
                  onClick: () => {
                    if (newNotification.link) {
                      navigateTo(newNotification.link)
                    }
                  },
                }
              : undefined,
          })
        },
      )
      .subscribe()
  }

  function unsubscribeFromNotifications() {
    if (realtimeChannel) {
      supabase.removeChannel(realtimeChannel)
      realtimeChannel = null
    }
  }

  return {
    unreadCount,
    notifications,
    isLoading,
    fetchUnreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    subscribeToNotifications,
    unsubscribeFromNotifications,
  }
})
