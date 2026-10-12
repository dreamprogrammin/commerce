import { dehydrate, hydrate, QueryClient } from '@tanstack/vue-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withoutUpdateTimes } from '@/utils/stableQueryState'

/*
 * Состояние TanStack Query уезжает в HTML страницы (plugins/vue-query.ts).
 * Vercel списывает запись ISR, только когда пересобранная страница
 * отличается от прежней, а время запроса (`dataUpdatedAt`) с миллисекундами
 * отличалось всегда: 10 октября 2026 два рендера главной, раздела, бренда и
 * серии подряд не совпадали ни разу, и каждая пересборка была платной.
 */

async function stateRenderedAt(at: number, data: unknown = [{ id: 1, title: 'Слайд' }]) {
  vi.setSystemTime(at)
  const client = new QueryClient()
  await client.prefetchQuery({ queryKey: ['global-slides'], queryFn: () => data })
  return dehydrate(client)
}

describe('withoutUpdateTimes', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('два рендера с разницей в сутки дают одно и то же состояние', async () => {
    vi.useFakeTimers()
    const first = await stateRenderedAt(Date.UTC(2026, 9, 10, 12))
    const second = await stateRenderedAt(Date.UTC(2026, 9, 11, 12))

    // Предпосылка: без правки состояния разные — именно это и было платным.
    expect(JSON.stringify(first)).not.toBe(JSON.stringify(second))
    expect(JSON.stringify(withoutUpdateTimes(first))).toBe(JSON.stringify(withoutUpdateTimes(second)))
  })

  it('другие данные — другое состояние: правка не прячет настоящие изменения', async () => {
    vi.useFakeTimers()
    const before = await stateRenderedAt(Date.UTC(2026, 9, 10, 12), [{ id: 1, price: 4990 }])
    const after = await stateRenderedAt(Date.UTC(2026, 9, 10, 12), [{ id: 1, price: 3990 }])

    expect(JSON.stringify(withoutUpdateTimes(before))).not.toBe(JSON.stringify(withoutUpdateTimes(after)))
  })

  it('данные, ключ и статус на месте; исходное состояние не тронуто', async () => {
    const client = new QueryClient()
    await client.prefetchQuery({ queryKey: ['brand', 'lego'], queryFn: () => ({ name: 'LEGO' }) })
    const raw = dehydrate(client)
    const rawJson = JSON.stringify(raw)

    const stable = withoutUpdateTimes(raw)

    expect(JSON.stringify(raw)).toBe(rawJson)
    expect(stable.queries).toHaveLength(1)
    expect(stable.queries[0]!.queryKey).toEqual(['brand', 'lego'])
    expect(stable.queries[0]!.state.data).toEqual({ name: 'LEGO' })
    expect(stable.queries[0]!.state.status).toBe('success')
  })

  it('время — 1, а не 0: hydrate() кладёт данные в уже созданный запрос, только если они новее', async () => {
    const client = new QueryClient()
    await client.prefetchQuery({ queryKey: ['category-rating', 'x'], queryFn: () => ({ avg_rating: 4.8, total_reviews: 12 }) })
    const stable = withoutUpdateTimes(dehydrate(client))

    // В браузере запрос мог появиться в кеше раньше, чем пришли данные из HTML.
    const browser = new QueryClient()
    browser.getQueryCache().build(browser, { queryKey: ['category-rating', 'x'] })
    hydrate(browser, stable)

    expect(stable.queries[0]!.state.dataUpdatedAt).toBe(1)
    expect(browser.getQueryData(['category-rating', 'x'])).toEqual({ avg_rating: 4.8, total_reviews: 12 })
  })
})
