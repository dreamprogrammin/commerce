import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const user = useSupabaseUser()
  const profileStore = useProfileStore() // Получаем доступ к стору профиля

  const isLoggedIn = computed(() => !!user.value && !user.value.is_anonymous)
  const isGuest = computed(() => !!user.value && user.value.is_anonymous)
  /**
   * Инициирует вход через OAuth (например, Google).
   */
  async function signInWithOAuth(provider: 'google' | 'apple', redirectTo: string = '/profile') {
    if (user.value && user.value.is_anonymous) {
      localStorage.setItem('anon_user_id_to_merge', user.value.id)
    }
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          // Указываем, куда Supabase должен вернуть пользователя после успешного входа
          redirectTo: `${window.location.origin}${redirectTo}`,
        },
      })
      if (error)
        throw error
    }
    catch (e: any) {
      localStorage.removeItem('anon_user_id_to_merge')
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
  async function checkForUserMerge() {
    const oldAnonId = localStorage.getItem('anon_user_id_to_merge')
    const newUserId = user.value?.id

    if (oldAnonId && newUserId && oldAnonId !== newUserId && user.value?.id.is_anonymous) {
      try {
        const { error } = await supabase
          .rpc('merge_anon_user_into_real_user', {
            old_anon_user_id: oldAnonId,
            new_real_user_id: newUserId,
          })
        if (error)
          throw error
        toast.success('Ваши гостевые данные и корзина успешно перенесены!')
        toast.success('С возвращением! Мы объединили ваши данные.', {
          description: 'Ваша гостевая корзина и приветственные бонусы успешно перенесены на ваш аккаунт!',
          duration: 8000,
        })
        await profileStore.loadProfile(true)
      }
      catch (e: any) {
        toast.error('Не удалось перенести данные гостя.', { description: e.message })
      }
      finally {
        localStorage.removeItem('anon_user_id_to_merge')
      }
    }
    else if (newUserId && !user.value?.is_anonymous) {
      const profileExisted = await profileStore.loadProfile()
      if (profileExisted) {
        // Если профиль уже существовал, значит, это "старый" друг.
        toast.info('С возвращением в наш магазин!', {
          description: `Рады видеть вас снова, ${profileStore.fullName}.`,
        })
      }
    }
  }
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
    user,
    isGuest,
    checkForUserMerge,
    signInWithOAuth,
    signOut,
    isLoggedIn,
  }
})
