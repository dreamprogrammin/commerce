import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const user = useSupabaseUser()
  const profileStore = useProfileStore()

  const isLoggedIn = computed(() => !!user.value)

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

  // Обработчик изменения состояния авторизации
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      await profileStore.loadProfile()

      toast.success('Добро пожаловать!', {
        description: 'Вы получили 1000 приветственных бонусов 🎁',
      })
    }
    else if (event === 'INITIAL_SESSION') {
      if (session) {
        await profileStore.loadProfile()
      }
    }
    else if (event === 'SIGNED_OUT') {
      profileStore.clearProfile()
    }
  })

  return {
    user,
    isLoggedIn,
    signInWithOAuth,
    signOut,
  }
})
