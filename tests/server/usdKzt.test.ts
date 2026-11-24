import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/*
 * Курс доллара для расхода ИИ в тенге (24 ноября 2026): лента Нацбанка РК,
 * память экземпляра на день по Алматы, запасной курс с пометкой.
 */

function feed(usd: string, quant = '1') {
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0"><channel>
<title>Official exchange rates of National Bank of Republic Kazakhstan</title>
<description>Official exchange rates of National Bank of Republic Kazakhstan</description>
<item><title>EUR</title><pubDate>24.11.2026</pubDate><description>530.4</description><quant>1</quant><index>UP</index><change>+1.1</change><link></link></item>
<item>
  <title>USD</title>
  <pubDate>24.11.2026</pubDate>
  <description>${usd}</description>
  <quant>${quant}</quant>
  <index>UP</index>
  <change>+0.12</change>
  <link></link>
</item>
</channel></rss>`
}

const load = () => import('~/server/utils/usdKzt')
const at = (iso: string) => new Date(iso)

beforeEach(() => {
  vi.resetModules()
  delete process.env.AI_STUB_URL
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('разбор ленты', () => {
  it('берёт USD, а не первую валюту; делит на quant', async () => {
    const { parseNbkUsd } = await load()
    expect(parseNbkUsd(feed('455.12'))).toEqual({ kzt: 455.12, date: '24.11.2026' })
    expect(parseNbkUsd(feed('45512', '100'))).toEqual({ kzt: 455.12, date: '24.11.2026' })
  })

  it('нет USD, мусор или курс вне разумного — null', async () => {
    const { parseNbkUsd } = await load()
    expect(parseNbkUsd(feed('455.12').replace('<title>USD</title>', '<title>RUB</title>'))).toBeNull()
    expect(parseNbkUsd('<html>Сервис недоступен</html>')).toBeNull()
    expect(parseNbkUsd(feed('45.512'))).toBeNull()
  })
})

describe('курс на сегодня', () => {
  it('ходит в ленту Нацбанка; второй раз за день — из памяти, на следующий день — снова', async () => {
    const fetch = vi.fn(async () => new Response(feed('455.12')))
    vi.stubGlobal('fetch', fetch)
    const { usdKztRate } = await load()
    expect(await usdKztRate(at('2026-11-24T10:00:00Z'))).toEqual({ kzt: 455.12, date: '24.11.2026' })
    expect(await usdKztRate(at('2026-11-24T18:00:00Z'))).toEqual({ kzt: 455.12, date: '24.11.2026' })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]![0]).toBe('https://nationalbank.kz/rss/rates_all.xml')
    // 19:00 UTC — уже 25-е по Алматы
    await usdKztRate(at('2026-11-24T19:00:00Z'))
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('лента молчит с самого начала — курс из кода с пометкой', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('The operation was aborted due to timeout')
    }))
    const { usdKztRate } = await load()
    expect(await usdKztRate(at('2026-11-24T10:00:00Z'))).toEqual({ kzt: 455.12, date: '24.11.2026', stale: true })
  })

  it('лента сломалась на следующий день — вчерашний курс с пометкой, а не курс из кода', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(new Response(feed('460.5').replaceAll('24.11.2026', '30.11.2026')))
      .mockResolvedValueOnce(new Response('Bad gateway', { status: 502 }))
    vi.stubGlobal('fetch', fetch)
    const { usdKztRate } = await load()
    expect(await usdKztRate(at('2026-11-30T10:00:00Z'))).toEqual({ kzt: 460.5, date: '30.11.2026' })
    expect(await usdKztRate(at('2026-12-01T10:00:00Z'))).toEqual({ kzt: 460.5, date: '30.11.2026', stale: true })
  })

  it('на стенде — у локальной заглушки, наружу не ходит', async () => {
    process.env.AI_STUB_URL = 'http://127.0.0.1:8788'
    const fetch = vi.fn(async () => new Response(feed('450')))
    vi.stubGlobal('fetch', fetch)
    const { usdKztRate } = await load()
    expect(await usdKztRate(at('2026-11-24T10:00:00Z'))).toEqual({ kzt: 450, date: '24.11.2026' })
    expect(fetch.mock.calls[0]![0]).toBe('http://127.0.0.1:8788/nbk/rates_all.xml')
  })
})
