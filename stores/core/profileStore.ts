import type { Database, ProfileRow, ProfileUpdate } from '@/types'
import { toast } from 'vue-sonner'

export const useProfileStore = defineStore('profileStore', () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const profile = ref<ProfileRow | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)

  // Computed свойства
  const bonusBalance = computed(() => profile.value?.active_bonus_balance ?? 0)
  const pendingBonuses = computed(() => profile.value?.pending_bonus_balance ?? 0)
  const isLoggedIn = computed(() => !!user.value && !!profile.value)

  const fullName = computed(() => {
    if (!profile.value)
      return 'Гость'

    const firstName = profile.value.first_name || ''
    const lastName = profile.value.last_name || ''
    const fullName = `${firstName} ${lastName}`.trim()

    return fullName || user.value?.email || 'Пользователь'
  })

  const isAdmin = computed(() => profile.value?.role === 'admin')

  /**
   * Загружает профиль текущего авторизованного пользователя
   */
  async function loadProfile(force: boolean = false): Promise<boolean> {
    if (!force && profile.value) {
      return true
    }
    if (!user.value) {
      profile.value = null
      return false
    }

    isLoading.value = true

    try {
      const { data, error, status } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .single()

      if (error && status !== 406) {
        throw error
      }

      profile.value = data
      return !!data
    }
    catch (error: any) {
      console.error('Profile loading error:', error)
      toast.error('Ошибка при загрузке профиля', {
        description: error.message,
      })
      return false
    }
    finally {
      isLoading.value = false
    }
  }

  /**
   * Обновляет профиль пользователя
   */
  async function updateProfile(updates: ProfileUpdate) {
    if (!user.value) {
      toast.error('Для обновления профиля необходимо войти в систему.')
      return false
    }

    isSaving.value = true

    try {
      const { data, error } = await supabase
        .from('profiles')
        .update(toRaw(updates))
        .eq('id', user.value.id)
        .select()
        .single()

      if (error)
        throw error

      profile.value = data
      toast.success('Профиль успешно обновлен!')
      return true
    }
    catch (error: any) {
      console.error('Profile update error:', error)
      toast.error('Ошибка при обновлении профиля', {
        description: error.message,
      })
      return false
    }
    finally {
      isSaving.value = false
    }
  }

  /**
   * Очищает состояние профиля
   */
  function clearProfile() {
    profile.value = null
  }

  // ✅ Следим за изменением пользователя
  watch(user, (newUser) => {
    if (newUser) {
      loadProfile()
    }
    else {
      clearProfile()
    }
  })

  return {
    // State
    profile,
    isLoading,
    isSaving,

    // Computed
    bonusBalance,
    pendingBonuses,
    fullName,
    isAdmin,
    isLoggedIn,

    // Actions
    loadProfile,
    updateProfile,
    clearProfile,
  }
})
