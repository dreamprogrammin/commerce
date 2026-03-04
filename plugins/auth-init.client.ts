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
  const user = useSupabaseUser()

  // ✅ Проверяем текущую сессию при инициализации
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.user) {
    // ✅ КРИТИЧНО: Проверяем localStorage напрямую
    const storedData = localStorage.getItem('profile-store')
    const hasStoredProfile = storedData ? JSON.parse(storedData)?.profile : null

    // Если в localStorage есть данные, даём Pinia время их восстановить
    if (hasStoredProfile) {
      // Ждём до 200мс с проверкой каждые 10мс
      for (let i = 0; i < 20; i++) {
        if (profileStore.profile) {
          break
        }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }

    // ✅ ИСПРАВЛЕНО: Профиль восстановится из localStorage автоматически
    // Загружаем только если СОВСЕМ нет профиля (новый пользователь)
    if (!profileStore.profile && !profileStore.isLoading) {
      // Загружаем только для новых пользователей
      profileStore.loadProfile(false, true).catch((error) => {
        console.error('[Auth Plugin] Profile load failed:', error)
      })
    }
  }

  // ✅ Используем Set для отслеживания обработанных событий
  const processedEvents = new Set<string>()

  // Регистрируем обработчик изменений auth state
  supabase.auth.onAuthStateChange(async (event, session) => {
    const eventKey = `${event}-${session?.user?.id}-${Date.now()}`

    // ✅ Предотвращаем дублирование обработки одного события
    if (processedEvents.has(eventKey)) {
      return
    }
    processedEvents.add(eventKey)

    if (event === 'SIGNED_IN') {
      // ✅ ИСПРАВЛЕНО: Используем кеш если профиль уже есть
      // force=false - возьмёт из localStorage если есть
      const hasProfile = await profileStore.loadProfile(false, true)

      // Синхронизация корзины при логине
      cartStore.mergeOnLogin().catch((error) => {
        console.error('[Auth Plugin] Cart merge failed:', error)
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
      // ✅ ИСПРАВЛЕНО: Обрабатываем INITIAL_SESSION (важно для OAuth редиректов)
      // Загружаем профиль только если его нет (в фоне)
      if (!profileStore.profile && !profileStore.isLoading) {
        profileStore.loadProfile(false, true).catch((error) => {
          console.error('[Auth Plugin] Profile load failed for initial session:', error)
        })
      }
    }
    else if (event === 'SIGNED_OUT') {
      profileStore.clearProfile()
      cartStore.cancelPendingSync()
      // Очищаем историю обработанных событий
      processedEvents.clear()
    }
    else if (event === 'TOKEN_REFRESHED') {
      // ✅ ИСПРАВЛЕНО: НЕ перезагружаем профиль - он уже в localStorage!
      // Токен обновился, но данные профиля те же самые
    }

    // ✅ Очищаем старые события (оставляем только последние 10)
    if (processedEvents.size > 10) {
      const eventsArray = Array.from(processedEvents)
      processedEvents.clear()
      eventsArray.slice(-10).forEach(e => processedEvents.add(e))
    }
  })
})
