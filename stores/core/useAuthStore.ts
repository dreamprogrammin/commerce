import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const supabaseUser = useSupabaseUser()

  // Используем напрямую useSupabaseUser вместо дублирования состояния
  const user = computed(() => supabaseUser.value)
  const isLoggedIn = computed(() => !!user.value)

  const profileStore = useProfileStore()

  /**
   * Инициирует вход через Google OAuth
   */
  async function signInWithOAuth(provider: 'google', redirectTo: string = '/profile') {
    try {
      console.log('[Auth Store] Starting OAuth flow, redirect to:', redirectTo)

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${redirectTo}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })

      if (error) {
        console.error('[Auth Store] OAuth error:', error)
        throw error
      }

      console.log('[Auth Store] OAuth redirect initiated')
    }
    catch (e: any) {
      console.error('[Auth Store] OAuth failed:', e)
      toast.error('Ошибка входа через Google', { description: e.message })
      throw e
    }
  }

  /**
   * Выполняет выход из системы
   */
  async function signOut() {
    try {
      console.log('[Auth Store] Signing out...')

      const { error } = await supabase.auth.signOut()

      if (error) {
        // "Auth session missing" — сессия уже невалидна (частая ситуация в Telegram-браузере)
        // Не блокируем выход, просто логируем
        console.warn('[Auth Store] Sign out warning:', error.message)
      }

      profileStore.clearProfile()

      console.log('[Auth Store] Sign out successful, redirecting to home')
      await router.push('/')

      toast.success('Вы успешно вышли из системы')
    }
    catch (e: any) {
      console.error('[Auth Store] Sign out failed:', e)
      // Даже при ошибке — очищаем локальное состояние
      profileStore.clearProfile()
      await router.push('/')
    }
  }

  // ✅ Отладка состояния авторизации
  watch(user, (newUser, oldUser) => {
    console.log('[Auth Store] User state changed:', {
      from: oldUser?.id,
      to: newUser?.id,
      hasProfile: !!profileStore.profile,
    })
  })

  return {
    user,
    isLoggedIn,
    signInWithOAuth,
    signOut,
  }
})
