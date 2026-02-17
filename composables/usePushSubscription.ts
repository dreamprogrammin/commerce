import type { Database } from '@/types'

export function usePushSubscription() {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()
  const config = useRuntimeConfig()

  const isSupported = ref(false)
  const permission = ref<NotificationPermission>('default')

  onMounted(() => {
    isSupported.value = 'serviceWorker' in navigator && 'PushManager' in window
    if (isSupported.value) {
      permission.value = Notification.permission
    }
  })

  function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const rawData = atob(base64)
    const outputArray = new Uint8Array(rawData.length)
    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i)
    }
    return outputArray
  }

  async function subscribe(): Promise<boolean> {
    if (!isSupported.value || !user.value)
      return false

    try {
      const result = await Notification.requestPermission()
      permission.value = result
      if (result !== 'granted')
        return false

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(config.public.vapidPublicKey),
      })

      const subJson = subscription.toJSON()

      const { error } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.value.id,
          endpoint: subJson.endpoint!,
          p256dh: subJson.keys!.p256dh,
          auth: subJson.keys!.auth,
          user_agent: navigator.userAgent,
        },
        { onConflict: 'user_id,endpoint' },
      )

      if (error) {
        console.error('[Push] Failed to save subscription:', error)
        return false
      }

      return true
    }
    catch (err) {
      console.error('[Push] Subscribe failed:', err)
      return false
    }
  }

  async function unsubscribe(): Promise<boolean> {
    if (!isSupported.value || !user.value)
      return false

    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()

      if (subscription) {
        const endpoint = subscription.endpoint
        await subscription.unsubscribe()

        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.value.id)
          .eq('endpoint', endpoint)
      }

      permission.value = Notification.permission
      return true
    }
    catch (err) {
      console.error('[Push] Unsubscribe failed:', err)
      return false
    }
  }

  return {
    isSupported,
    permission,
    subscribe,
    unsubscribe,
  }
}
