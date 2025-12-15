import { useAuthStore } from '@/stores/auth'

/**
 * Композабл для работы с аутентификацией
 */
export function useAuth() {
  const authStore = useAuthStore()

  /**
   * Вход через Google
   */
  async function handleAuthGoogle() {
    try {
      await authStore.signInWithOAuth('google', '/profile')
    }
    catch (error) {
      console.error('Ошибка входа через Google:', error)
      throw error
    }
  }

  /**
   * Выход из системы
   */
  async function handleOut() {
    await authStore.signOut()
  }

  return {
    handleAuthGoogle,
    handleOut,
  }
}
