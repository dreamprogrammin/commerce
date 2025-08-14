import type { Database, ProfileRow, ProfileUpdate } from '@/types'
import { toast } from 'vue-sonner'

export const useProfileStore = defineStore('profileStore', () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const profile = ref<ProfileRow | null>(null)

  const isLoading = ref(false)
  const isSaving = ref(false)

  const bonusBalance = computed(() => profile.value?.bonus_balance ?? 0)

  const fullName = computed(() => {
    if (!profile.value)
      return 'Гость'
    return `${profile.value.first_name || ''} ${profile.value.last_name || ''}`.trim()
  })

  const isAdmin = computed(() => profile.value?.role === 'admin')

  /**
   * Загружает профиль текущего авторизованного пользователя.
   * Если пользователь не вошел, ничего не делает.
   */

  async function loadProfile() {
    if (profile.value)
      return
    if (!user.value)
      return

    isLoading.value = true

    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .single()

      if (error && status !== 406)
        throw error

      profile.value = data
    }
    catch (error: any) {
      toast.error('Ошибка при загрузке профиля', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Обновляет профиль пользователя в базе данных.
   * @param updates - Объект с полями, которые нужно обновить.
   */

  async function updateProfile(updates: ProfileUpdate) {
    if (!user.value) {
      toast.error('Для обновления профиля необходимо войти в систему.')
    }

    isSaving.value = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.value.id)
        .select()
        .single()

      if (error)
        throw error

      profile.value = data
      toast.success('Профиль успешно обновлен!')
    }
    catch (error: any) {
      toast.error('Ошибка при обновлении профиля', { description: error.message })
    }
    finally {
      isSaving.value = false
    }
  }

  /**
   * Очищает состояние профиля.
   * Вызывается при выходе пользователя из системы.
   */

  function clearProfile() {
    profile.value = null
  }

  // Следим за состоянием авторизации. Если пользователь меняется (входит или выходит),
  // мы реагируем на это.

  watch(user, (newUser) => {
    if (newUser) {
      loadProfile()
    }
    else {
      clearProfile()
    }
  }, { immediate: true })

  return {
    profile,
    isLoading,
    isSaving,
    bonusBalance,
    fullName,
    isAdmin,
    loadProfile,
    updateProfile,
    clearProfile,
  }
})
