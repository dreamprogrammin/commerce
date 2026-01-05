import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'

/**
 * Client-only plugin для инициализации auth state
 * Обрабатывает события Supabase Auth и синхронизирует профиль
 */
export default defineNuxtPlugin(async () => {
  const supabase = useSupabaseClient()
  const profileStore = useProfileStore()
  const user = useSupabaseUser()

  console.log('[Auth Plugin] Initializing auth state listener')

  // ✅ Проверяем текущую сессию при инициализации
  const { data: { session } } = await supabase.auth.getSession()

  if (session?.user) {
    console.log('[Auth Plugin] Found existing session on init:', session.user.id)

    // ✅ ИСПРАВЛЕНИЕ: НЕ ждем загрузку профиля - запускаем в фоне
    if (!profileStore.profile && !profileStore.isLoading) {
      console.log('[Auth Plugin] Starting profile load in background...')

      // Запускаем загрузку, но НЕ ждем (чтобы не блокировать приложение)
      profileStore.loadProfile(false, true)
        .then(hasProfile => {
          if (hasProfile) {
            console.log('[Auth Plugin] Profile loaded successfully on init')
          } else {
            console.log('[Auth Plugin] No profile yet (might be new user)')
          }
        })
        .catch(error => {
          console.error('[Auth Plugin] Profile load failed on init:', error)
        })
    }
  } else {
    console.log('[Auth Plugin] No session found on init')
  }

  // ✅ Используем Set для отслеживания обработанных событий
  const processedEvents = new Set<string>()

  // Регистрируем обработчик изменений auth state
  supabase.auth.onAuthStateChange(async (event, session) => {
    const eventKey = `${event}-${session?.user?.id}-${Date.now()}`
    
    console.log(`[Auth Plugin] Auth state changed: ${event}`, {
      userId: session?.user?.id,
      hasProfile: !!profileStore.profile
    })

    // ✅ Предотвращаем дублирование обработки одного события
    if (processedEvents.has(eventKey)) {
      console.log(`[Auth Plugin] Event ${eventKey} already processed, skipping`)
      return
    }
    processedEvents.add(eventKey)

    if (event === 'SIGNED_IN') {
      console.log('[Auth Plugin] User signed in, loading profile...')

      // Ждем создания профиля для новых пользователей
      const hasProfile = await profileStore.loadProfile(true, true)

      if (hasProfile) {
        toast.success('С возвращением!', {
          description: `Добро пожаловать, ${profileStore.fullName}!`,
        })
      } else {
        toast.success('Добро пожаловать!', {
          description: 'Сделайте первую покупку и получите 1000 приветственных бонусов! 🎁',
          duration: 7000,
        })
      }
    }
    else if (event === 'INITIAL_SESSION' && session?.user) {
      // ✅ ИСПРАВЛЕНО: Обрабатываем INITIAL_SESSION (важно для OAuth редиректов)
      console.log('[Auth Plugin] Initial session detected, checking profile...')

      // Загружаем профиль только если его нет (в фоне)
      if (!profileStore.profile && !profileStore.isLoading) {
        console.log('[Auth Plugin] Loading profile for initial session...')
        profileStore.loadProfile(false, true).catch(error => {
          console.error('[Auth Plugin] Profile load failed for initial session:', error)
        })
      }
    }
    else if (event === 'SIGNED_OUT') {
      console.log('[Auth Plugin] User signed out, clearing profile')
      profileStore.clearProfile()
      // Очищаем историю обработанных событий
      processedEvents.clear()
    }
    else if (event === 'TOKEN_REFRESHED') {
      console.log('[Auth Plugin] Token refreshed')
      // Перезагружаем профиль только если его нет (в фоне)
      if (!profileStore.profile && session?.user) {
        console.log('[Auth Plugin] Reloading profile after token refresh')
        profileStore.loadProfile(true, false).catch(error => {
          console.error('[Auth Plugin] Profile load failed after token refresh:', error)
        })
      }
    }

    // ✅ Очищаем старые события (оставляем только последние 10)
    if (processedEvents.size > 10) {
      const eventsArray = Array.from(processedEvents)
      processedEvents.clear()
      eventsArray.slice(-10).forEach(e => processedEvents.add(e))
    }
  })

  console.log('[Auth Plugin] Auth state listener initialized')
})