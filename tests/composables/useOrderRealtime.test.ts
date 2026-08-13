import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOrderRealtime } from '@/composables/useOrderRealtime'
import { mockSupabaseClient } from '../setup'

const mockProfileStore = { isAdmin: false }

vi.mock('@/stores/core/profileStore', () => ({
  useProfileStore: () => mockProfileStore,
}))

vi.mock('@/composables/useProductCacheInvalidation', () => ({
  useProductCacheInvalidation: () => ({ refetchAllProducts: vi.fn() }),
}))

describe('useOrderRealtime.subscribeAll', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    // Не local и не отключён переменной окружения — иначе subscribeToOrders
    // выйдет по своим ранним проверкам и тест перестанет проверять роль.
    vi.stubGlobal('useRuntimeConfig', () => ({
      public: { supabase: { url: 'https://example.supabase.co' } },
    }))
    mockSupabaseClient.channel.mockClear()
    mockProfileStore.isAdmin = false
  })

  afterEach(() => {
    // ordersChannel и guestCheckoutsChannel живут на уровне модуля и переживают
    // тест: без отписки следующий вызов упрётся в «Already subscribed».
    useOrderRealtime().unsubscribe()
    vi.unstubAllGlobals()
  })

  /*
   * Ради этого всё и делается. Раньше subscribeAll вызывался из app.vue
   * безусловно, и у каждого гостя на каждой странице открывался WebSocket с
   * двумя подписками. Событий он не приносил никогда: RLS у orders и
   * guest_checkouts не отдаёт анониму ни одной строки, а postgres_changes
   * применяет ту же RLS к подписчику.
   */
  it('гостю каналы не открывает', () => {
    mockProfileStore.isAdmin = false

    useOrderRealtime().subscribeAll()

    expect(mockSupabaseClient.channel).not.toHaveBeenCalled()
  })

  it('администратору открывает оба канала', () => {
    mockProfileStore.isAdmin = true

    useOrderRealtime().subscribeAll()

    expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(2)
    const names = mockSupabaseClient.channel.mock.calls.map(c => c[0])
    expect(names).toEqual(['orders-realtime', 'guest-checkouts-realtime'])
  })

  it('повторный вызов не плодит каналы', () => {
    mockProfileStore.isAdmin = true
    const realtime = useOrderRealtime()

    realtime.subscribeAll()
    realtime.subscribeAll()

    expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(2)
  })

  it('после отписки админ может подписаться снова', () => {
    mockProfileStore.isAdmin = true
    const realtime = useOrderRealtime()

    realtime.subscribeAll()
    realtime.unsubscribe()
    mockSupabaseClient.channel.mockClear()
    realtime.subscribeAll()

    expect(mockSupabaseClient.channel).toHaveBeenCalledTimes(2)
  })
})
