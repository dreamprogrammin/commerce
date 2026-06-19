import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

/**
 * Client-only plugin для инициализации auth state
 * Обрабатывает события Supabase Auth и синхронизирует профиль
 */
export default defineNuxtPlugin(async () => {
  const supabase = useSupabaseClient()
  const profileStore = useProfileStore()
  const cartStore = useCartStore()

  // ✅ Проверяем initial session синхронно (без requestIdleCallback)
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.user && !profileStore.profile && !profileStore.isLoading) {
    // Запускаем загрузку профиля, но не ждем результат чтобы не блокировать приложение
    profileStore.loadProfile(false, true).catch((error) => {
      console.error('[Auth Plugin] Profile load failed:', error)
    })
  }

  const processedEvents = new Set<string>()

  // Register auth state change handler
  supabase.auth.onAuthStateChange(async (event, session) => {
    const eventKey = `${event}-${session?.user?.id}-${Date.now()}`

    if (processedEvents.has(eventKey)) {
      return
    }
    processedEvents.add(eventKey)

    console.log(`[Auth Plugin] Event: ${event}, User: ${session?.user?.id}`)

    if (event === 'SIGNED_IN') {
      // ✅ Для Safari/Firefox: ждем завершения загрузки профиля с таймаутом
      let hasProfile = false
      
      try {
        // Создаем промис с таймаутом 5 секунд
        hasProfile = await Promise.race([
          profileStore.loadProfile(false, true),
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Profile load timeout')), 5000)
          ),
        ])
      } catch (error: any) {
        console.error('[Auth Plugin] Profile load error or timeout:', error.message)
        // Если таймаут или ошибка - пытаемся все равно показать приветствие
        hasProfile = !!profileStore.profile
      }

      // Слияние корзины отложенно
      setTimeout(() => {
        cartStore.mergeOnLogin().catch((error) => {
          console.error('[Auth Plugin] Cart merge failed:', error)
        })
      }, 100)

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
