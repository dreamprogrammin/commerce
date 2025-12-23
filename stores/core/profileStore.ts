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
   * @param force Принудительная перезагрузка
   * @param waitForCreation Ждать создания профиля (используется только при первом входе после OAuth)
   */
  async function loadProfile(force: boolean = false, waitForCreation: boolean = false): Promise<boolean> {
    if (!force && profile.value) {
      return true
    }
    if (!user.value) {
      profile.value = null
      return false
    }

    isLoading.value = true

    try {
      // ✅ Используем maybeSingle() вместо single() - не падает, если нет данных
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.value.id)
        .maybeSingle()

      // Обрабатываем ошибки
      if (error) {
        console.error('Profile loading error:', error)
        throw error
      }

      // Если профиля нет и мы НЕ ждем создания - это нормально
      // Профиль создастся при первом заказе
      if (!data && !waitForCreation) {
        console.log('No profile yet for user:', user.value.id, '(will be created on first order)')
        profile.value = null
        return false
      }

      // Если мы ждем создания профиля (после OAuth) - делаем несколько попыток
      if (!data && waitForCreation) {
        console.log('Waiting for profile creation...')
        // Пробуем 3 раза с небольшими задержками
        for (let attempt = 1; attempt <= 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 300 * attempt))

          const { data: retryData, error: retryError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.value.id)
            .maybeSingle()

          if (retryError) {
            console.error('Profile retry error:', retryError)
            continue
          }

          if (retryData) {
            console.log('Profile found on attempt', attempt)
            profile.value = retryData
            return true
          }
        }

        // После всех попыток профиля все еще нет - это OK
        console.log('No profile created yet (normal for new users)')
        profile.value = null
        return false
      }

      // Профиль найден
      profile.value = data
      if (data) {
        console.log('Profile loaded successfully:', data.id)
      }

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
      // ✅ ВСЕГДА снимаем загрузку в конце
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
      // ✅ Здесь single() корректен - мы обновляем существующий профиль
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
