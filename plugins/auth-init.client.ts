import { toast } from 'vue-sonner'
import { useProfileStore } from '@/stores/core/profileStore'

/**
 * Client-only plugin для инициализации auth state
 * Обрабатывает события Supabase Auth и синхронизирует профиль
 */
export default defineNuxtPlugin(async () => {
  const supabase = useSupabaseClient()
  const profileStore = useProfileStore()

  console.log('[Auth Plugin] Initializing auth state listener')

  // Регистрируем ONE-TIME обработчик изменений auth state
  // Это гарантирует что обработчик зарегистрирован только один раз
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log(`[Auth Plugin] Event: ${event}`, session?.user?.id)

    if (event === 'SIGNED_IN') {
      console.log('[Auth Plugin] User signed in, loading profile...')

      // Загружаем профиль с force=true для новой сессии
      const hasProfile = await profileStore.loadProfile(true, false)

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
    else if (event === 'INITIAL_SESSION') {
      console.log('[Auth Plugin] Initial session detected')

      if (session?.user) {
        // Даем время на инициализацию
        await new Promise(resolve => setTimeout(resolve, 100))

        // Загружаем профиль с force=true
        await profileStore.loadProfile(true, false)

        console.log('[Auth Plugin] Profile loaded:', !!profileStore.profile)

        // Retry если не загрузился
        if (!profileStore.profile) {
          console.log('[Auth Plugin] Retrying profile load...')
          await new Promise(resolve => setTimeout(resolve, 300))
          await profileStore.loadProfile(true, false)
        }
      }
    }
    else if (event === 'SIGNED_OUT') {
      console.log('[Auth Plugin] User signed out, clearing profile')
      profileStore.clearProfile()
    }
    else if (event === 'TOKEN_REFRESHED') {
      console.log('[Auth Plugin] Token refreshed')
      // Перезагружаем профиль если его нет
      if (!profileStore.profile && session?.user) {
        console.log('[Auth Plugin] Reloading profile after token refresh')
        await profileStore.loadProfile(true, false)
      }
    }
  })

  console.log('[Auth Plugin] Auth state listener initialized')
})
