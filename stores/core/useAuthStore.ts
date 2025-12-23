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
  async function signInWithOAuth(provider: 'google', redirectTo: string = '/') {
    try {
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
      if (error)
        throw error
    }
    catch (e: any) {
      toast.error('Ошибка входа через Google', { description: e.message })
      throw e
    }
  }

  /**
   * Выполняет выход из системы
   */
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error)
        throw error

      profileStore.clearProfile()
      await router.push('/')
      toast.success('Вы успешно вышли из системы')
    }
    catch (e: any) {
      toast.error('Ошибка при выходе', { description: e.message })
    }
  }

  return {
    user,
    isLoggedIn,
    signInWithOAuth,
    signOut,
  }
})
