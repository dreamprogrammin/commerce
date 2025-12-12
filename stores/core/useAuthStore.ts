import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const user = useSupabaseUser()
  const profileStore = useProfileStore()

  // ✅ Теперь все просто: либо залогинен, либо нет (анонимов больше нет)
  const isLoggedIn = computed(() => !!user.value)
  const isGuest = computed(() => !user.value)

  /**
   * Инициирует вход через OAuth (например, Google).
   */
  async function signInWithOAuth(provider: 'google' | 'apple', redirectTo: string = '/profile') {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: `${window.location.origin}${redirectTo}`,
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

      profileStore.clearProfile()
      await router.push('/')
      toast.success('Вы успешно вышли из системы.')
    }
    catch (e: any) {
      toast.error('Ошибка при выходе', { description: e.message })
    }
  }

  /**
   * ✅ НОВАЯ ЛОГИКА: Проверяем, новый ли это пользователь
   * Если да - показываем приветствие с информацией о бонусах
   */
  async function checkForNewUser() {
    if (!user.value)
      return

    try {
      // Загружаем профиль
      const profileExists = await profileStore.loadProfile(true)

      if (profileExists && profileStore.profile) {
        const profile = profileStore.profile

        // Проверяем, есть ли приветственные бонусы
        if (profile.has_received_welcome_bonus && profile.pending_bonus_balance >= 1000) {
          // Это новый пользователь, показываем приветствие
          toast.success('Добро пожаловать! 🎉', {
            description: 'Вам начислено 1000 приветственных бонусов! Они станут доступны через 14 дней.',
            duration: 8000,
          })
        }
        else if (profile.has_received_welcome_bonus) {
          // Старый пользователь возвращается
          toast.info(`С возвращением, ${profileStore.fullName}!`, {
            description: 'Рады видеть вас снова в нашем магазине.',
            duration: 5000,
          })
        }
      }
    }
    catch (e: any) {
      console.error('Error checking user status:', e)
    }
  }

  // Следим за изменениями авторизации
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      // При входе проверяем, новый ли пользователь
      checkForNewUser()
    }
    else if (event === 'INITIAL_SESSION' && user.value) {
      // При восстановлении сессии просто загружаем профиль
      profileStore.loadProfile()
    }
    else if (event === 'SIGNED_OUT') {
      profileStore.clearProfile()
    }
  })

  return {
    user,
    isGuest,
    isLoggedIn,
    signInWithOAuth,
    signOut,
    checkForNewUser, // ✅ Новый метод вместо checkForUserMerge
  }
})
