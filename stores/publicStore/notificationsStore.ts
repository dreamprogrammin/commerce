import type { Database } from '@/types'

type Notification = Database['public']['Tables']['notifications']['Row']

export const useNotificationsStore = defineStore('notificationsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const unreadCount = ref(0)
  const notifications = ref<Notification[]>([])
  const isLoading = ref(false)

  async function fetchUnreadCount() {
    if (!user.value) return
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.value.id)
      .eq('is_read', false)

    unreadCount.value = count ?? 0
  }

  async function fetchNotifications() {
    if (!user.value) return
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
    if (!user.value) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.value.id)
      .eq('is_read', false)

    notifications.value.forEach(n => n.is_read = true)
    unreadCount.value = 0
  }

  return {
    unreadCount,
    notifications,
    isLoading,
    fetchUnreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
  }
})
