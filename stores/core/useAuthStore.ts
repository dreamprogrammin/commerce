import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const user = useSupabaseUser()
  const profileStore = useProfileStore() // Получаем доступ к стору профиля

  const isLoggedIn = computed(() => !!user.value)
  /**
   * Инициирует вход через OAuth (например, Google).
   */
  async function signInWithOAuth(provider: 'google' | 'apple' = 'google') {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // Указываем, куда Supabase должен вернуть пользователя после успешного входа
          redirectTo: `${window.location.origin}/profile`,
        },
      })
      if (error)
        throw error
    }
    catch (e: any) {
      toast.error(`Ошибка входа через ${provider}`, { description: e.message })
    }
  }

  /**
   * Выполняет выход пользователя из системы.
   */
  async function signOut() {
    try {
      const { error } = await supabase.auth.signOut()
      if (error)
        throw error

      // ЯВНО очищаем профиль. `watch` в profileStore тоже сработает, но так надежнее.
      profileStore.clearProfile()

      await router.push('/')
      toast.success('Вы успешно вышли из системы.')
    }
    catch (e: any) {
      toast.error('Ошибка при выходе', { description: e.message })
    }
  }

  // === СЛУШАЕМ ИЗМЕНЕНИЯ СОСТОЯНИЯ АУТЕНТИФИКАЦИИ ===
  // Эта функция будет автоматически вызываться библиотекой Supabase
  // каждый раз, когда меняется статус пользователя (вошел, вышел, обновился токен).
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      // Если пользователь вошел или сессия восстановилась,
      // мы принудительно запускаем загрузку его профиля.
      profileStore.loadProfile()
    }
    else if (event === 'SIGNED_OUT') {
      // Если пользователь вышел, очищаем профиль.
      profileStore.clearProfile()
    }
  })

  return {
    user, // Возвращаем `user` прямо из стора для удобства
    signInWithOAuth,
    signOut,
    isLoggedIn,
  }
})
