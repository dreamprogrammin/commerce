import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdminRevalidateStore } from '@/stores/adminStore/adminRevalidateStore'
import { buildRevalidateRequests, mergeRevalidateBody } from '@/utils/revalidatePages'

/*
 * Правки админки копятся и уходят одним пакетом через минуту после последней:
 * десять товаров подряд пересобирали главную и раздел десять раз — записи ISR
 * сверх лимита Vercel Hobby (14 октября 2026).
 */

const A = '11111111-1111-1111-1111-111111111111'
const B = '22222222-2222-2222-2222-222222222222'

describe('слияние правок', () => {
  it('id и адреса — без повторов, scope сохраняется', () => {
    const merged = mergeRevalidateBody(
      mergeRevalidateBody({}, { productIds: [A], paths: ['/'] }),
      { productIds: [A, B], paths: ['/', '/brands'], scope: 'catalog' },
    )
    expect(merged).toEqual({ productIds: [A, B], paths: ['/', '/brands'], scope: 'catalog' })
  })

  it('адреса — частями по 50, удалённый товар — своим запросом', () => {
    const paths = Array.from({ length: 120 }, (_, i) => `/p${i}`)
    const requests = buildRevalidateRequests({ productIds: [A], paths }, [{ slug: 'x', categoryId: null, brandId: null }])
    expect(requests.map(r => r.url)).toEqual([
      '/api/admin/revalidate',
      '/api/admin/revalidate',
      '/api/admin/revalidate',
      '/api/admin/revalidate-product',
    ])
    expect((requests[0]!.body as { paths: string[], productIds: string[] }).paths).toHaveLength(50)
    expect((requests[0]!.body as { productIds: string[] }).productIds).toEqual([A])
    expect((requests[2]!.body as { paths: string[] }).paths).toHaveLength(20)
  })

  it('пусто — запросов нет', () => {
    expect(buildRevalidateRequests({}, [])).toEqual([])
  })
})

describe('очередь сброса кеша', () => {
  const adminFetch = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
    adminFetch.mockReset().mockResolvedValue({ revalidated: 7, failed: [] })
    vi.stubGlobal('adminFetch', adminFetch)
    vi.stubGlobal('useNuxtApp', () => ({
      $supabase: { client: { auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 't' } } }) } } },
    }))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('две правки подряд — один запрос через минуту после ПОСЛЕДНЕЙ', async () => {
    const queue = useAdminRevalidateStore()
    queue.enqueue({ productIds: [A] })
    await vi.advanceTimersByTimeAsync(40_000)
    queue.enqueue({ productIds: [B] })
    expect(queue.changes).toBe(2)

    await vi.advanceTimersByTimeAsync(40_000)
    expect(adminFetch).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(20_000)
    expect(adminFetch).toHaveBeenCalledTimes(1)
    expect(adminFetch.mock.calls[0]![1].body).toEqual({ productIds: [A, B] })
    expect(queue.changes).toBe(0)
    expect(queue.deadline).toBeNull()
    expect(queue.lastResult).toMatchObject({ revalidated: 7, failed: 0 })
  })

  it('«Обновить сейчас» отправляет сразу и снимает таймер', async () => {
    const queue = useAdminRevalidateStore()
    queue.enqueue({ paths: ['/'] })
    await queue.flushNow()
    expect(adminFetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(adminFetch).toHaveBeenCalledTimes(1)
  })

  it('ошибка сервера — в итоге, а не исключением', async () => {
    adminFetch.mockRejectedValue(Object.assign(new Error('x'), { statusMessage: 'Нужен вход' }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const queue = useAdminRevalidateStore()
    queue.enqueue({ paths: ['/'] })
    await queue.flushNow()
    expect(queue.lastResult).toMatchObject({ error: 'Нужен вход', failed: 1 })
    warn.mockRestore()
  })
})
