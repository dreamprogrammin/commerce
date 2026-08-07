import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProfileStore } from '@/stores/core/profileStore'
import { mockQueryBuilder, mockSupabaseClient } from '../setup'

/**
 * Зависшая загрузка профиля.
 *
 * У fetch нет таймаута по умолчанию. Если соединение зависало, промис не
 * разрешался никогда: loadingPromise не очищался, isLoading оставался true, и
 * все, кто ждал профиль, ждали вечно — на экране навсегда оставался скелетон.
 * Причём следующий вызов loadProfile не спасал: он возвращал тот же зависший
 * промис.
 */
describe('profileStore: обрыв зависшей загрузки', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())

    mockQueryBuilder.select.mockReset().mockReturnThis()
    mockQueryBuilder.eq.mockReset().mockReturnThis()
    mockQueryBuilder.maybeSingle.mockReset().mockResolvedValue({ data: null, error: null })
    mockSupabaseClient.from.mockReset().mockReturnValue(mockQueryBuilder)

    globalThis.useSupabaseUser = () => ({
      value: { id: 'user-123', email: 'test@example.com' },
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('не ждёт вечно, если запрос не отвечает', async () => {
    const store = useProfileStore()

    // Запрос, который не разрешится никогда.
    mockQueryBuilder.maybeSingle.mockImplementationOnce(() => new Promise(() => {}))

    const pending = store.loadProfile()
    await vi.advanceTimersByTimeAsync(10_000)

    await expect(pending).resolves.toBe(false)
    expect(store.isLoading).toBe(false)
  })

  it('после обрыва следующий вызов делает новый запрос, а не ждёт прежний', async () => {
    const store = useProfileStore()

    mockQueryBuilder.maybeSingle.mockImplementationOnce(() => new Promise(() => {}))

    const first = store.loadProfile()
    await vi.advanceTimersByTimeAsync(10_000)
    await first

    // Прежний loadingPromise должен быть очищен — иначе второй вызов вернул бы
    // тот же зависший промис и покупатель снова остался бы со скелетоном.
    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'user-123', first_name: 'Тест', active_bonus_balance: 0 },
      error: null,
    })

    await expect(store.loadProfile()).resolves.toBe(true)
    expect(store.profile).not.toBeNull()
    expect(mockQueryBuilder.maybeSingle).toHaveBeenCalledTimes(2)
  })

  it('быстрый ответ таймаут не задевает', async () => {
    const store = useProfileStore()

    mockQueryBuilder.maybeSingle.mockResolvedValueOnce({
      data: { id: 'user-123', first_name: 'Тест', active_bonus_balance: 500 },
      error: null,
    })

    await expect(store.loadProfile()).resolves.toBe(true)
    expect(store.bonusBalance).toBe(500)
    expect(store.isLoading).toBe(false)
  })
})
