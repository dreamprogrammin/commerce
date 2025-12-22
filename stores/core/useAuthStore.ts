import type { Database } from '@/types/supabase'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useProfileStore } from './profileStore'

export const useAuthStore = defineStore('authStore', () => {
  const supabase = useSupabaseClient<Database>()
  const router = useRouter()
  const supabaseUser = useSupabaseUser()
  // Используем локальный ref для пользователя, чтобы иметь полный контроль над обновлением
  const user = ref(supabaseUser.value)
  const profileStore = useProfileStore()

  // Синхронизируем локальный стейт с useSupabaseUser при гидратации
  watch(supabaseUser, (newUser) => {
    if (newUser) {
      user.value = newUser
    }
  })

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
    console.log(`AUTH DEBUG: Auth Event: ${event}`, session)
    
    // 🔥 ВАЖНО: Обновляем пользователя вручную, так как useSupabaseUser может тупить
    user.value = session?.user || null

    if (event === 'SIGNED_IN') {
      console.log('AUTH DEBUG: SIGNED_IN triggered. Session:', session)
      console.log('AUTH DEBUG: Current User:', user.value)
      
      // Пытаемся загрузить профиль
      const hasProfile = await profileStore.loadProfile()
      console.log('AUTH DEBUG: Profile loaded?', hasProfile)

      if (hasProfile) {
        // Профиль уже существует - обычный вход
        toast.success('С возвращением!', {
          description: `Добро пожаловать, ${profileStore.fullName}!`,
        })
      }
      else {
        // Профиля нет - первый вход
        console.log('AUTH DEBUG: No profile found, showing welcome toast')
        toast.success('Добро пожаловать!', {
          description: 'Сделайте первую покупку и получите 1000 приветственных бонусов! 🎁',
          duration: 7000,
        })
      }
    }
    else if (event === 'INITIAL_SESSION') {
      console.log('AUTH DEBUG: INITIAL_SESSION triggered. Session:', session)
      if (session) {
        await profileStore.loadProfile()
      } else {
        console.log('AUTH DEBUG: No session in INITIAL_SESSION')
      }
    }
    else if (event === 'SIGNED_OUT') {
      console.log('AUTH DEBUG: SIGNED_OUT triggered')
      profileStore.clearProfile()
    }
    else if (event === 'TOKEN_REFRESHED') {
      console.log('AUTH DEBUG: TOKEN_REFRESHED')
    }
    else {
      console.log(`AUTH DEBUG: Unhandled event: ${event}`)
    }
  })

  return {
    user,
    isLoggedIn,
    signInWithOAuth,
    signOut,
  }
})
