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
   * @param silent Фоновый refetch — не устанавливает isLoading (не показывает скелетон)
   */
  async function loadProfile(force: boolean = false, waitForCreation: boolean = false, silent: boolean = false): Promise<boolean> {
    console.log('[ProfileStore] loadProfile called:', { force, waitForCreation, silent, hasUser: !!user.value, hasProfile: !!profile.value, isLoading: isLoading.value })

    // Если уже идет загрузка - возвращаем существующий промис
    if (loadingPromise && !force) {
      console.log('[ProfileStore] Returning existing loading promise')
      return await loadingPromise
    }

    // Если профиль уже есть (из кеша или предыдущей загрузки)
    if (!force && profile.value) {
      console.log('[ProfileStore] Profile already loaded from cache')
      return true
    }

    if (!user.value) {
      console.log('[ProfileStore] No user, clearing profile')
      profile.value = null
      isLoading.value = false
      loadingPromise = null
      return false
    }

    // ✅ Создаем промис для текущей загрузки
    loadingPromise = (async () => {
      console.log('[ProfileStore] Starting profile load...')
      
      // silent=true — фоновый refetch, не трогаем isLoading чтобы не мигал UI
      if (!silent)
        isLoading.value = true

      try {
        // Пробуем загрузить профиль
        console.log('[ProfileStore] Fetching profile for user:', user.value!.id)
        
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.value!.id)
          .maybeSingle()

        if (error) {
          console.error('[ProfileStore] Profile loading error:', error)
          throw error
        }

        console.log('[ProfileStore] Profile fetch result:', { found: !!data, waitForCreation })

        // Если профиль найден - сохраняем и выходим
        if (data) {
          profile.value = data
          console.log('[ProfileStore] Profile loaded successfully')

          // Активируем pending бонусы если есть (замена pg_cron)
          if (data.pending_bonus_balance > 0) {
            activatePendingBonuses()
          }

          return true
        }

        // Если профиля нет и мы НЕ ждем создания
        if (!waitForCreation) {
          console.log('[ProfileStore] Profile not found, not waiting for creation')
          profile.value = null
          return false
        }

        // ✅ Если ждем создания - делаем несколько попыток с экспоненциальной задержкой
        console.log('[ProfileStore] Profile not found, waiting for creation with retries...')
        const maxAttempts = 5
        const delays = [100, 300, 500, 1000, 2000] // миллисекунды

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          console.log(`[ProfileStore] Retry attempt ${attempt + 1}/${maxAttempts}, waiting ${delays[attempt]}ms`)
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
            profile.value = retryData
            console.log('[ProfileStore] Profile found on retry', attempt + 1)
            return true
          }
        }

        // После всех попыток профиля нет — пробуем создать через RPC (последний шанс)
        console.warn('[ProfileStore] Profile not found after retries, calling ensure_profile_exists RPC...')
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: ensureError } = await (supabase as any).rpc('ensure_profile_exists')

          if (!ensureError) {
            console.log('[ProfileStore] RPC ensure_profile_exists called successfully')
            // Re-fetch profile after RPC creation
            const { data: newProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', user.value!.id)
              .maybeSingle()

            if (newProfile) {
              profile.value = newProfile
              console.info('[ProfileStore] Profile created via ensure_profile_exists RPC')
              return true
            }
            else {
              console.error('[ProfileStore] Profile still not found after RPC')
            }
          }
          else {
            console.error('[ProfileStore] ensure_profile_exists RPC error:', ensureError)
          }
        }
        catch (rpcError) {
          console.error('[ProfileStore] ensure_profile_exists RPC threw:', rpcError)
        }

        console.error('[ProfileStore] Failed to load/create profile after all attempts')
        toast.error('Профиль не найден', {
          description: 'Попробуйте выйти и войти снова.',
        })
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
        console.log('[ProfileStore] loadProfile finally block, setting isLoading=false')
        if (!silent)
          isLoading.value = false
        loadingPromise = null
      }
    })()

    return loadingPromise
  }

  /**
   * Обновляет профиль пользователя
   */
  async function updateProfile(updates: ProfileUpdate, { silent = false } = {}) {
    if (!user.value) {
      if (!silent)
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
      if (!silent)
        toast.success('Профиль успешно обновлен!')
      return true
    }
    catch (error: any) {
      console.error('[ProfileStore] Profile update error:', error)
      if (!silent) {
        toast.error('Ошибка при обновлении профиля', {
          description: error.message,
        })
      }
      return false
    }
    finally {
      isSaving.value = false
    }
  }

  /**
   * Активирует pending бонусы пользователя (замена pg_cron)
   * Вызывается автоматически при загрузке профиля
   */
  async function activatePendingBonuses() {
    if (!user.value)
      return

    try {
      const { data, error } = await supabase.rpc('activate_my_pending_bonuses')

      if (error) {
        console.error('[ProfileStore] Bonus activation error:', error)
        return
      }

      // Если бонусы были активированы — перезагрузим профиль для обновления балансов
      if (data && data.activated > 0) {
        const { data: updatedProfile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.value.id)
          .single()

        if (updatedProfile) {
          profile.value = updatedProfile
        }
      }
    }
    catch (error) {
      console.error('[ProfileStore] Bonus activation error:', error)
    }
  }

  /**
   * Очищает состояние профиля
   */
  function clearProfile() {
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
}, {
  // ✅ КРИТИЧНО: Сохраняем профиль в localStorage
  persist: {
    key: 'profile-store',
    pick: ['profile'], // Сохраняем только profile, не isLoading/isSaving
    storage: piniaPluginPersistedstate.localStorage(),
  },
})
