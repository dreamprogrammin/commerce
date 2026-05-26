import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

/**
 * Client-only plugin для инициализации auth state
 * Обрабатывает события Supabase Auth и синхронизирует профиль
 */
export default defineNuxtPlugin(() => {
  const supabase = useSupabaseClient()
  const profileStore = useProfileStore()
  const cartStore = useCartStore()

  // Defer initial session check to avoid blocking
  const requestIdleCallback = globalThis.requestIdleCallback || ((cb: IdleRequestCallback) => setTimeout(cb, 1))
  
  requestIdleCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user && !profileStore.profile && !profileStore.isLoading) {
      profileStore.loadProfile(false, true).catch((error) => {
        console.error('[Auth Plugin] Profile load failed:', error)
      })
    }
  })

  const processedEvents = new Set<string>()

  // Register auth state change handler
  supabase.auth.onAuthStateChange(async (event, session) => {
    const eventKey = `${event}-${session?.user?.id}-${Date.now()}`

    if (processedEvents.has(eventKey)) {
      return
    }
    processedEvents.add(eventKey)

    if (event === 'SIGNED_IN') {
      const hasProfile = await profileStore.loadProfile(false, true)

      // Defer cart merge
      requestIdleCallback(() => {
        cartStore.mergeOnLogin().catch((error) => {
          console.error('[Auth Plugin] Cart merge failed:', error)
        })
      })

      if (hasProfile) {
        toast.success('С возвращением!', {
          description: `Добро пожаловать, ${profileStore.fullName}!`,
        })
      }
      else {
        toast.success('Добро пожаловать!', {
          description: 'Сделайте первую покупку и получите 1000 приветственных бонусов! 🎁',
          duration: 7000,
        })
      }
    }
    else if (event === 'INITIAL_SESSION' && session?.user) {
      if (!profileStore.profile && !profileStore.isLoading) {
        profileStore.loadProfile(false, true).catch((error) => {
          console.error('[Auth Plugin] Profile load failed for initial session:', error)
        })
      }
    }
    else if (event === 'SIGNED_OUT') {
      profileStore.clearProfile()
      cartStore.cancelPendingSync()
      processedEvents.clear()
    }

    if (processedEvents.size > 10) {
      const eventsArray = Array.from(processedEvents)
      processedEvents.clear()
      eventsArray.slice(-10).forEach(e => processedEvents.add(e))
    }
  })
})
