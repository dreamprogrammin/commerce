import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useModalStore } from '../modal/useModalStore'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const user = useSupabaseUser()
  const profileStore = useProfileStore()

  const isLoggedIn = computed(() => !!user.value && !user.value.is_anonymous)
  const isGuest = computed(() => !!user.value && user.value.is_anonymous)

  /**
   * Инициирует вход через Google OAuth
   */
  async function signInWithOAuth(provider: 'google', redirectTo: string = '/') {
    if (user.value && user.value.is_anonymous) {
      localStorage.setItem('anon_user_id_to_merge', user.value.id)
    }
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
      localStorage.removeItem('anon_user_id_to_merge')
      toast.error('Ошибка входа через Google', { description: e.message })
      throw e
    }
  }

  /**
   * Выполняет выход пользователя из системы
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
   * Проверяет и объединяет данные анонимного пользователя с реальным
   */
  async function checkForUserMerge() {
    const oldAnonId = localStorage.getItem('anon_user_id_to_merge')
    const newUserId = user.value?.id

    if (oldAnonId && newUserId && oldAnonId !== newUserId && !user.value?.is_anonymous) {
      try {
        const { error } = await supabase
          .rpc('merge_anon_user_into_real_user', {
            old_anon_user_id: oldAnonId,
            new_real_user_id: newUserId,
          })
        if (error)
          throw error
        toast.success('Ваши гостевые данные и корзина успешно перенесены!')
        await profileStore.loadProfile(true)
      }
      catch (e: any) {
        toast.error('Не удалось перенести данные гостя.', { description: e.message })
      }
      finally {
        localStorage.removeItem('anon_user_id_to_merge')
      }
    }
  }

  // Обработчик изменения состояния авторизации
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN') {
      await profileStore.loadProfile()
      await checkForUserMerge()

      const modalStore = useModalStore()
      modalStore.closeLoginModal()

      toast.success('Добро пожаловать!', {
        description: 'Вы успешно вошли в систему',
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
    isGuest,
    isLoggedIn,
    checkForUserMerge,
    signInWithOAuth,
    signOut,
  }
})
