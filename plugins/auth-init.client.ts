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

  /*
   * Корзина вошедшего сверяется с серверной (stores/publicStore/cartStore.ts,
   * utils/cartSync.ts) при входе, при открытии сайта уже вошедшим и при
   * возврате на вкладку: корзину могли изменить в другом браузере.
   */
  function syncCart(userId: string | undefined) {
    if (!userId)
      return
    cartStore.syncWithServer(userId).catch((error) => {
      console.error('[Auth Plugin] Cart sync failed:', error)
    })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      syncCart(useSupabaseUser().value?.id)
  })

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
            setTimeout(() => reject(new Error('Profile load timeout')), 5000),
          ),
        ])
      }
      catch (error: any) {
        console.error('[Auth Plugin] Profile load error or timeout:', error.message)
        // Если таймаут или ошибка - пытаемся все равно показать приветствие
        hasProfile = !!profileStore.profile
      }

      // Сверка корзины с серверной: при входе гостевая объединяется с ней
      syncCart(session?.user?.id)

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
      // Открыл сайт уже вошедшим — до 1.11.2026 корзину здесь не сверяли, и
      // положенное в другом браузере сюда не доходило (а бот о нём напоминал)
      syncCart(session.user.id)
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
