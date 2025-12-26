import type { Database, ProfileRow, ProfileUpdate } from '@/types'
import { toast } from 'vue-sonner'

export const useProfileStore = defineStore('profileStore', () => {
  const supabase = useSupabaseClient<Database>()
  const user = useSupabaseUser()

  const profile = ref<ProfileRow | null>(null)
  const isLoading = ref(false)
  const isSaving = ref(false)
  
  // ✅ Добавляем флаг для предотвращения множественных загрузок
  let loadingPromise: Promise<boolean> | null = null

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
    // ✅ Если уже идет загрузка - возвращаем существующий промис (с таймаутом)
    if (loadingPromise && !force) {
      console.log('[ProfileStore] Already loading, returning existing promise')
      try {
        // Добавляем таймаут 10 секунд
        return await Promise.race([
          loadingPromise,
          new Promise<boolean>((_, reject) => 
            setTimeout(() => reject(new Error('Profile load timeout')), 10000)
          )
        ])
      } catch (error) {
        console.error('[ProfileStore] Loading promise timed out or failed, forcing reload')
        loadingPromise = null
        isLoading.value = false
        // Продолжаем выполнение для повторной попытки
      }
    }

    // Если профиль уже есть и не требуется принудительная перезагрузка
    if (!force && profile.value) {
      console.log('[ProfileStore] Profile already loaded')
      return true
    }

    if (!user.value) {
      console.log('[ProfileStore] No user, clearing profile')
      profile.value = null
      isLoading.value = false
      return false
    }

    // ✅ Создаем промис для текущей загрузки
    loadingPromise = (async () => {
      isLoading.value = true
      console.log('[ProfileStore] Starting profile load for user:', user.value?.id)

      try {
        // Пробуем загрузить профиль
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.value!.id)
          .maybeSingle()

        if (error) {
          console.error('[ProfileStore] Profile loading error:', error)
          throw error
        }

        // Если профиль найден - сохраняем и выходим
        if (data) {
          console.log('[ProfileStore] Profile loaded successfully:', data.id)
          profile.value = data
          return true
        }

        // Если профиля нет и мы НЕ ждем создания
        if (!waitForCreation) {
          console.log('[ProfileStore] No profile found, not waiting')
          profile.value = null
          return false
        }

        // ✅ Если ждем создания - делаем несколько попыток с экспоненциальной задержкой
        console.log('[ProfileStore] Waiting for profile creation...')
        const maxAttempts = 5
        const delays = [100, 300, 500, 1000, 2000] // миллисекунды

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt]))

          const { data: retryData, error: retryError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.value!.id)
            .maybeSingle()

          if (retryError) {
            console.error('[ProfileStore] Profile retry error:', retryError)
            continue
          }

          if (retryData) {
            console.log('[ProfileStore] Profile found on attempt', attempt + 1)
            profile.value = retryData
            return true
          }
        }

        // После всех попыток профиля нет
        console.log('[ProfileStore] Profile not created after all attempts')
        profile.value = null
        return false
      }
      catch (error: any) {
        console.error('[ProfileStore] Profile loading error:', error)
        toast.error('Ошибка при загрузке профиля', {
          description: error.message,
        })
        profile.value = null
        return false
      }
      finally {
        // ✅ КРИТИЧНО: ВСЕГДА снимаем загрузку и очищаем промис
        console.log('[ProfileStore] Profile load completed, resetting loading state')
        isLoading.value = false
        loadingPromise = null
      }
    })()

    return loadingPromise
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
      console.error('[ProfileStore] Profile update error:', error)
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
    console.log('[ProfileStore] Clearing profile')
    profile.value = null
    isLoading.value = false
    loadingPromise = null
  }

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