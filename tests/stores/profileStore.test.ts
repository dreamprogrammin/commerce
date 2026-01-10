import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import type { ProfileRow } from '@/types'
import { mockSupabaseClient, mockQueryBuilder, mockToast } from '../setup'

const mockProfile: ProfileRow = {
  id: 'user-123',
  email: 'test@example.com',
  first_name: 'Иван',
  last_name: 'Иванов',
  phone: '+77771234567',
  avatar_url: null,
  active_bonus_balance: 500,
  pending_bonus_balance: 100,
  role: 'user',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

describe('profileStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // ✅ Очищаем и пересоздаем моки с дефолтным поведением
    mockQueryBuilder.select.mockClear().mockReturnThis()
    mockQueryBuilder.eq.mockClear().mockReturnThis()
    mockQueryBuilder.maybeSingle.mockClear().mockResolvedValue({ data: null, error: null })
    mockQueryBuilder.single.mockClear().mockResolvedValue({ data: null, error: null })
    mockQueryBuilder.update.mockClear().mockReturnThis()
    mockSupabaseClient.from.mockClear()
    mockToast.success.mockClear()
    mockToast.error.mockClear()

    // ✅ Устанавливаем пользователя по умолчанию
    global.useSupabaseUser = vi.fn(() => ({
      value: { id: 'user-123', email: 'test@example.com' }
    }))
  })

  describe('loadProfile', () => {
    it('должен загрузить профиль успешно', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      const result = await store.loadProfile()

      expect(result).toBe(true)
      expect(store.profile).toEqual(mockProfile)
      expect(store.isLoading).toBe(false)
    })

    it('должен вернуть false если пользователь не авторизован', async () => {
      // ✅ Устанавливаем неавторизованного пользователя
      global.useSupabaseUser = vi.fn(() => ({ value: null }))

      const store = useProfileStore()
      const result = await store.loadProfile()

      expect(result).toBe(false)
      expect(store.profile).toBeNull()
      expect(store.isLoading).toBe(false)
    })

    it('должен предотвратить параллельную загрузку профиля', async () => {
      const store = useProfileStore()

      // Симулируем медленный запрос (500ms)
      mockQueryBuilder.maybeSingle.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                data: mockProfile,
                error: null,
              })
            }, 500)
          }),
      )

      // Запускаем две параллельные загрузки
      const promise1 = store.loadProfile()
      const promise2 = store.loadProfile()

      const [result1, result2] = await Promise.all([promise1, promise2])

      expect(result1).toBe(true)
      expect(result2).toBe(true)

      // Должен быть только ОДИН запрос к Supabase
      expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(1)
      expect(store.profile).toEqual(mockProfile)
    })

    it('должен не загружать профиль повторно если он уже есть', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      // Первая загрузка
      await store.loadProfile()

      // Вторая загрузка без force
      const result = await store.loadProfile()

      expect(result).toBe(true)
      // Должен быть только один запрос
      expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(1)
    })

    it('должен перезагрузить профиль с force=true', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({
          data: mockProfile,
          error: null,
        })
        .mockResolvedValueOnce({
          data: { ...mockProfile, first_name: 'Петр' },
          error: null,
        })

      // Первая загрузка
      await store.loadProfile()
      expect(store.profile?.first_name).toBe('Иван')

      // Принудительная перезагрузка
      await store.loadProfile(true)
      expect(store.profile?.first_name).toBe('Петр')

      // Должно быть два запроса
      expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(2)
    })

    it('должен обработать ошибку при загрузке профиля', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error'),
      })

      const result = await store.loadProfile()

      expect(result).toBe(false)
      expect(store.profile).toBeNull()
      expect(store.isLoading).toBe(false)
    })

    it('должен ждать создания профиля при waitForCreation=true', async () => {
      const store = useProfileStore()

      // Первый запрос - профиль не найден, второй retry - профиль найден
      mockQueryBuilder.maybeSingle
        .mockResolvedValueOnce({
          data: null,
          error: null,
        })
        .mockResolvedValueOnce({
          data: mockProfile,
          error: null,
        })

      const result = await store.loadProfile(false, true)

      expect(result).toBe(true)
      expect(store.profile).toEqual(mockProfile)
      // 1 основной запрос + 1 retry
      expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(2)
    })

    it('должен прекратить попытки после 5 неудач при waitForCreation', async () => {
      const store = useProfileStore()

      // Все запросы возвращают null (профиль не создан)
      mockQueryBuilder.maybeSingle.mockResolvedValue({
        data: null,
        error: null,
      })

      const result = await store.loadProfile(false, true)

      expect(result).toBe(false)
      expect(store.profile).toBeNull()
      // 1 основной запрос + 5 retries
      expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(6)
    }, 10000) // увеличиваем timeout для теста

    it('EDGE CASE: должен обработать таймаут при долгой загрузке', async () => {
      const store = useProfileStore()

      // Симулируем ОЧЕНЬ медленный запрос (12 секунд - больше таймаута)
      mockQueryBuilder.maybeSingle
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              setTimeout(() => {
                resolve({
                  data: mockProfile,
                  error: null,
                })
              }, 12000)
            }),
        )
        // Второй запрос (после таймаута) должен пройти быстро
        .mockResolvedValueOnce({
          data: mockProfile,
          error: null,
        })

      // Первый вызов - начинает загрузку
      const promise1 = store.loadProfile()

      // Ждем немного
      await new Promise(resolve => setTimeout(resolve, 100))

      // Второй вызов - должен попытаться использовать первый промис
      // но получит таймаут через 10 секунд, а затем retry с force=true
      const promise2 = store.loadProfile()

      // ✅ Второй промис теперь НЕ выбрасывает ошибку, а делает retry
      const result2 = await promise2

      expect(result2).toBe(true)
      expect(store.profile).toEqual(mockProfile)
      expect(store.isLoading).toBe(false)

      // Должно быть 2 запроса: первый зависший + retry после таймаута
      expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(2)
    }, 15000)
  })

  describe('computed properties', () => {
    it('должен правильно вычислить bonusBalance', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      await store.loadProfile()

      expect(store.bonusBalance).toBe(500)
    })

    it('должен вернуть 0 для bonusBalance если профиль не загружен', () => {
      const store = useProfileStore()

      expect(store.bonusBalance).toBe(0)
    })

    it('должен правильно вычислить pendingBonuses', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      await store.loadProfile()

      expect(store.pendingBonuses).toBe(100)
    })

    it('должен правильно вычислить fullName', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      await store.loadProfile()

      expect(store.fullName).toBe('Иван Иванов')
    })

    it('должен вернуть email если имя не указано', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { ...mockProfile, first_name: null, last_name: null },
        error: null,
      })

      // Используем force=true чтобы перезагрузить профиль
      await store.loadProfile(true)

      expect(store.fullName).toBe('test@example.com')
    })

    it('должен вернуть "Гость" если профиль не загружен', () => {
      const store = useProfileStore()

      expect(store.fullName).toBe('Гость')
    })

    it('должен правильно определить isAdmin', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: { ...mockProfile, role: 'admin' },
        error: null,
      })

      // Используем force=true чтобы перезагрузить профиль
      await store.loadProfile(true)

      expect(store.isAdmin).toBe(true)
    })

    it('должен вернуть false для isAdmin для обычного пользователя', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      // Используем force=true чтобы перезагрузить профиль
      await store.loadProfile(true)

      expect(store.isAdmin).toBe(false)
    })
  })

  describe('updateProfile', () => {
    it('должен обновить профиль успешно', async () => {
      const store = useProfileStore()

      // Загружаем профиль
      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })
      await store.loadProfile()

      // Обновляем профиль
      const updatedProfile = { ...mockProfile, first_name: 'Петр' }
      mockQueryBuilder.single.mockResolvedValueOnce({
        data: updatedProfile,
        error: null,
      })

      const result = await store.updateProfile({ first_name: 'Петр' })

      expect(result).toBe(true)
      expect(store.profile?.first_name).toBe('Петр')
      expect(store.isSaving).toBe(false)
    })

    it('должен вернуть false если пользователь не авторизован', async () => {
      // ✅ Устанавливаем неавторизованного пользователя
      global.useSupabaseUser = vi.fn(() => ({ value: null }))

      const store = useProfileStore()
      const result = await store.updateProfile({ first_name: 'Петр' })

      expect(result).toBe(false)
    })

    it('должен обработать ошибку при обновлении', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })
      await store.loadProfile()

      mockQueryBuilder.single.mockResolvedValueOnce({
        data: null,
        error: new Error('Update failed'),
      })

      const result = await store.updateProfile({ first_name: 'Петр' })

      expect(result).toBe(false)
      expect(store.isSaving).toBe(false)
    })
  })

  describe('clearProfile', () => {
    it('должен очистить профиль и состояние', async () => {
      const store = useProfileStore()

      mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
        data: mockProfile,
        error: null,
      })

      await store.loadProfile()
      expect(store.profile).not.toBeNull()

      store.clearProfile()

      expect(store.profile).toBeNull()
      expect(store.isLoading).toBe(false)
    })
  })
})
