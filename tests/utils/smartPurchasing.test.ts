import type { DemandTopic } from '../../utils/marketDemand'
import type { PurchasingStatus } from '../../utils/smartPurchasing'
import { describe, expect, it } from 'vitest'
import { demandOverview, nextAutoRefresh, purchasingSteps, refreshesLeft, seriesMonths } from '../../utils/smartPurchasing'

const overview = (topics: number) => ({ ...demandOverview([], 0), topics })
type Demand = NonNullable<PurchasingStatus['demand']>
function demandPart(patch: Partial<Demand> = {}): Demand {
  return {
    hasKey: false,
    running: false,
    lastDoneAt: null,
    lastFailed: false,
    lastCost: null,
    balance: null,
    balanceError: null,
    overview: overview(92),
    ...patch,
  }
}

// Как на бою 3.11.2026: поставщики есть, каналов и ключей нет, спрос не обновлялся
function status(patch: Partial<PurchasingStatus> = {}): PurchasingStatus {
  return {
    suppliers: 4,
    channels: { total: 0, open: 0, suppliers: 0 },
    telegram: null,
    offers: null,
    demand: demandPart(),
    ai: { providers: [], model: 'anthropic/claude-haiku-5-5' },
    restock: { atThreshold: 0, noSupplier: 0, suppliers: 0, openOrders: 0 },
    supplierLoad: [],
    unassigned: { products: 0, toRestock: 0 },
    ...patch,
  }
}
const step = (s: PurchasingStatus, id: string) => purchasingSteps(s).find(x => x.id === id)!

describe('purchasingSteps', () => {
  it('шаги по порядку: откуда товар → спрос → чтение постов → товары поставщиков → заказ', () => {
    expect(purchasingSteps(status()).map(s => s.id)).toEqual(['suppliers', 'demand', 'ai', 'offers', 'order'])
  })

  it('как на бою 3.11: ждут владельца каналы, ключ DataForSEO и ключ ИИ', () => {
    const steps = purchasingSteps(status())
    expect(steps.map(s => s.state)).toEqual(['action', 'action', 'action', 'later', 'done'])
    expect(steps[0]!.facts).toEqual(['4 поставщика', 'каналов в Telegram нет'])
    expect(steps[0]!.next).toMatch(/«Каналы в Telegram»/)
    expect(steps[1]!.facts).toEqual(['92 темы', 'цифр ещё нет', 'ключ DataForSEO не задан'])
    expect(steps[1]!.next).toBe('Задайте ключ DataForSEO на странице «Спрос на рынке» и нажмите «Обновить сейчас» — около $0,18 с баланса DataForSEO.')
    expect(steps[2]!.facts).toEqual(['ключа ИИ нет'])
    expect(steps[3]!.next).toBe('Заработает после миграции базы.')
    expect(steps[4]!.facts).toEqual(['заказывать нечего — всё выше порога остатка'])
  })

  it('ссылки — на страницы шагов', () => {
    expect(purchasingSteps(status()).map(s => s.link?.to ?? null))
      .toEqual(['/admin/suppliers', '/admin/demand', '/admin/ai', '/admin/supplier-offers', '/admin/restock'])
  })

  describe('товары поставщиков', () => {
    const channels = { total: 2, open: 1, suppliers: 2 }
    const offers = (patch: Partial<NonNullable<PurchasingStatus['offers']>> = {}) => ({ fresh: 0, added: 0, skipped: 0, collectedAt: null, ...patch })

    it('без каналов — появится после шага 1', () => {
      expect(step(status({ offers: offers() }), 'offers')).toMatchObject({ state: 'later', facts: ['каналов нет'], next: 'Появится, когда у поставщиков будут каналы в Telegram — шаг 1.' })
    })

    it('каналы есть, не собирали — ждёт владельца', () => {
      expect(step(status({ channels, offers: offers() }), 'offers')).toMatchObject({ state: 'action', facts: ['ещё не собирали'], next: 'Откройте «Товары поставщиков» и нажмите «Собрать новые».' })
    })

    it('есть неразобранные — сколько, когда собрано и сколько уже на сайте', () => {
      const s = step(status({ channels, offers: offers({ fresh: 5, added: 2, skipped: 7, collectedAt: '2026-11-04T09:00:00Z' }) }), 'offers')
      expect(s.state).toBe('action')
      expect(s.facts).toEqual(['не разобрано: 5 товаров', 'последний сбор — 4 ноября', 'добавлено на сайт: 2'])
      expect(s.next).toMatch(/«Добавил».*«Не брать»/)
    })

    it('всё разобрано — готово', () => {
      const s = step(status({ channels, offers: offers({ skipped: 3, collectedAt: '2026-11-03T20:00:00Z' }) }), 'offers')
      expect(s.state).toBe('done')
      // 20:00 UTC — уже 4 ноября в Алматы
      expect(s.facts).toEqual(['всё разобрано', 'последний сбор — 4 ноября'])
    })
  })

  describe('поставщики и каналы', () => {
    it('каналы у всех поставщиков, все открытые — готово без пояснений', () => {
      const s = step(status({ suppliers: 2, channels: { total: 3, open: 3, suppliers: 2 } }), 'suppliers')
      expect(s.state).toBe('done')
      expect(s.facts).toEqual(['2 поставщика', '3 канала в Telegram'])
      expect(s.next).toBeNull()
    })

    it('каналы не у всех и часть закрытых — сколько у кого и что читать через аккаунт', () => {
      const s = step(status({ suppliers: 4, channels: { total: 2, open: 1, suppliers: 1 } }), 'suppliers')
      expect(s.state).toBe('done')
      expect(s.facts).toEqual(['4 поставщика', '2 канала в Telegram — у 1 из 4 поставщиков', 'через аккаунт: 1'])
      expect(s.next).toBe('Закрытые каналы читаются только через аккаунт Telegram — его страница заработает после миграции базы.')
    })

    describe('закрытый канал и аккаунт Telegram', () => {
      const closed = { suppliers: 2, channels: { total: 2, open: 1, suppliers: 2 } }

      it('аккаунт не подключён — ждёт владельца, кнопка на «Аккаунт Telegram»', () => {
        const s = step(status({ ...closed, telegram: { connected: false } }), 'suppliers')
        expect(s.state).toBe('action')
        expect(s.facts).toEqual(['2 поставщика', '2 канала в Telegram', 'через аккаунт: 1'])
        expect(s.next).toBe('Закрытые каналы читаются только через аккаунт Telegram — подключите его на странице «Аккаунт Telegram».')
        expect(s.link).toEqual({ to: '/admin/telegram', label: 'Аккаунт Telegram' })
      })

      it('аккаунт подключён — готово, кнопка снова на «Поставщики»', () => {
        const s = step(status({ ...closed, telegram: { connected: true } }), 'suppliers')
        expect(s.state).toBe('done')
        expect(s.facts).toEqual(['2 поставщика', '2 канала в Telegram', 'через аккаунт: 1', 'аккаунт Telegram подключён'])
        expect(s.next).toBeNull()
        expect(s.link?.to).toBe('/admin/suppliers')
      })

      it('закрытых каналов нет — аккаунт шагу не нужен', () => {
        const s = step(status({ suppliers: 2, channels: { total: 2, open: 2, suppliers: 2 }, telegram: { connected: false } }), 'suppliers')
        expect(s.state).toBe('done')
        expect(s.facts).toEqual(['2 поставщика', '2 канала в Telegram'])
        expect(s.next).toBeNull()
      })
    })

    it('«у 1 из 21 поставщика», «1 канал», «5 каналов»', () => {
      expect(step(status({ suppliers: 21, channels: { total: 1, open: 1, suppliers: 1 } }), 'suppliers').facts[1])
        .toBe('1 канал в Telegram — у 1 из 21 поставщика')
      expect(step(status({ suppliers: 5, channels: { total: 5, open: 5, suppliers: 5 } }), 'suppliers').facts)
        .toEqual(['5 поставщиков', '5 каналов в Telegram'])
    })

    it('поставщиков нет — сначала завести поставщика', () => {
      const s = step(status({ suppliers: 0 }), 'suppliers')
      expect(s.state).toBe('action')
      expect(s.facts[0]).toBe('поставщиков нет')
      expect(s.next).toMatch(/^Добавьте поставщика/)
    })

    it('без миграции каналов — «в разработке», без цифр каналов', () => {
      const s = step(status({ channels: null }), 'suppliers')
      expect(s.state).toBe('later')
      expect(s.facts).toEqual(['4 поставщика'])
      expect(s.next).toBe('Заработает после миграции базы.')
    })
  })

  describe('спрос на рынке', () => {
    const demand = (patch: Partial<Demand>) => step(status({ demand: demandPart({ hasKey: true, ...patch }) }), 'demand')

    it('ключ есть, обновлений не было — нажать «Обновить сейчас» и сколько это стоит', () => {
      const s = demand({})
      expect(s.state).toBe('action')
      expect(s.facts).toEqual(['92 темы', 'цифр ещё нет'])
      expect(s.next).toBe('Нажмите «Обновить сейчас» на странице «Спрос на рынке» — около $0,18 с баланса DataForSEO.')
    })

    it('обновление идёт — «идёт», даже без ключа', () => {
      expect(demand({ running: true }).state).toBe('running')
      expect(demand({ running: true, hasKey: false }).state).toBe('running')
    })

    it('последнее обновление не удалось — к причине на странице спроса', () => {
      const s = demand({ lastFailed: true, lastDoneAt: '2026-10-05T05:00:00Z' })
      expect(s.state).toBe('action')
      expect(s.next).toMatch(/не удалось/)
    })

    it('обновлено — дата по Алматы, дальше само', () => {
      // 20:30 UTC 2 ноября — в Алматы уже 3 ноября
      const s = demand({ lastDoneAt: '2026-11-02T20:30:00Z' })
      expect(s.state).toBe('done')
      expect(s.facts).toEqual(['92 темы', 'обновлено 3 ноября'])
      expect(s.next).toMatch(/5-го числа/)
    })

    it('«1 тема», «5 тем»', () => {
      expect(demand({ overview: overview(1) }).facts[0]).toBe('1 тема')
      expect(demand({ overview: overview(5) }).facts[0]).toBe('5 тем')
    })

    it('без миграции спроса — «в разработке»', () => {
      expect(step(status({ demand: null }), 'demand')).toMatchObject({ state: 'later', facts: [], next: 'Заработает после миграции базы.' })
    })
  })

  describe('чтение постов ИИ', () => {
    const anthropic = { id: 'anthropic', label: 'Anthropic (Claude)' }

    it('ключ есть и подходит модели — дальше разработка, а не владелец', () => {
      const s = step(status({ ai: { providers: [anthropic], model: 'anthropic/claude-haiku-5-5' } }), 'ai')
      expect(s.state).toBe('later')
      expect(s.facts).toEqual(['ключ: Anthropic (Claude)', 'модель: claude-haiku-5-5'])
      expect(s.next).toMatch(/^Ключ есть/)
    })

    it('у выбранной модели нет ключа её провайдера — ждёт владельца', () => {
      const s = step(status({ ai: { providers: [anthropic], model: 'openai/gpt-6.1-terra' } }), 'ai')
      expect(s.state).toBe('action')
      expect(s.facts).toEqual(['ключ: Anthropic (Claude)', 'модель: gpt-6.1-terra'])
      expect(s.next).toMatch(/нет ключа/)
    })

    it('два ключа — «ключи»', () => {
      const s = step(status({ ai: { providers: [anthropic, { id: 'gemini', label: 'Google (Gemini)' }], model: 'gemini/gemini-4-argon' } }), 'ai')
      expect(s.facts[0]).toBe('ключи: Anthropic (Claude), Google (Gemini)')
      expect(s.state).toBe('later')
    })

    it('без миграции ключей — «в разработке»', () => {
      expect(step(status({ ai: null }), 'ai').state).toBe('later')
    })
  })

  describe('заказ поставщику', () => {
    const order = (patch: Partial<PurchasingStatus['restock']>) =>
      step(status({ restock: { atThreshold: 0, noSupplier: 0, suppliers: 0, openOrders: 0, ...patch } }), 'order')

    it('есть что заказать — сколько и у скольких поставщиков, нажать «Заказал»', () => {
      const s = order({ atThreshold: 12, suppliers: 3 })
      expect(s.state).toBe('action')
      expect(s.facts).toEqual(['к закупке 12 товаров у 3 поставщиков'])
      expect(s.next).toMatch(/«Заказал»/)
      expect(s.next).not.toMatch(/без поставщика/)
    })

    it('часть без поставщика — оба дела одной строкой', () => {
      const s = order({ atThreshold: 10, noSupplier: 9, suppliers: 1 })
      expect(s.facts).toEqual(['к закупке 1 товар у 1 поставщика', '9 товаров без поставщика'])
      expect(s.next).toMatch(/«Заказал».*Товарам без поставщика назначьте/)
    })

    it('только без поставщика — назначить, «Заказал» не к чему', () => {
      const s = order({ atThreshold: 2, noSupplier: 2 })
      expect(s.state).toBe('action')
      expect(s.facts).toEqual(['2 товара без поставщика'])
      expect(s.next).toBe('Товарам без поставщика назначьте его там же — иначе их не заказать.')
    })

    it('заказано, ждём поставку — «идёт»', () => {
      const s = order({ openOrders: 2 })
      expect(s.state).toBe('running')
      expect(s.facts).toEqual(['ждём поставку по 2 заказам'])
      expect(s.next).toMatch(/«Принять»/)
    })

    it('без миграции заказов — считает только пороги', () => {
      const s = order({ openOrders: null })
      expect(s.state).toBe('done')
      expect(s.facts).toEqual(['заказывать нечего — всё выше порога остатка'])
    })
  })
})

function topic(patch: Partial<DemandTopic>): DemandTopic {
  return {
    topic_id: patch.name ?? 'тема',
    name: 'Тема',
    kind: 'type',
    keywords: ['тема'],
    match_terms: [],
    is_active: true,
    series: null,
    volume_last: null,
    volume_avg3: null,
    volume_prev3: null,
    trend_pct: null,
    peak_month: null,
    peak_ratio: null,
    season_soon: false,
    our_total: 0,
    our_in_stock: 0,
    data_until: null,
    updated_at: null,
    ...patch,
  }
}
// 24 месяца: n в первых 21, last — в трёх последних
const months = (n: number, last = n) => Array.from({ length: 24 }, (_, i) => (i >= 21 ? last : n))

describe('demandOverview', () => {
  const dolls = topic({ name: 'Куклы', series: months(1000), volume_avg3: 1000, trend_pct: 0, our_total: 5, our_in_stock: 3, data_until: '2026-10-01' })
  const labubu = topic({ name: 'Лабубу', series: months(100, 300), volume_avg3: 300, trend_pct: 200, data_until: '2026-10-01' })
  const sleds = topic({ name: 'Ледянки', series: months(50), volume_avg3: 50, trend_pct: 0, season_soon: true, our_total: 2, our_in_stock: 0, data_until: '2026-10-01' })
  const off = topic({ name: 'Отключённая', is_active: false, series: months(9999), volume_avg3: 9999, data_until: '2026-10-01' })
  const fresh = topic({ name: 'Новая, без цифр' })
  const all = [dolls, labubu, sleds, off, fresh]

  it('цифр нет — темы считаются, спроса и списков нет', () => {
    const o = demandOverview([fresh, topic({ name: 'Ещё одна' }), topic({ name: 'Выключена', is_active: false })], 0)
    expect(o).toMatchObject({ topics: 2, withData: 0, monthly: null, series: null, trend: null, dataUntil: null, missing: 0, growing: 0, season: 0 })
    expect(o.top).toEqual({ missing: [], growing: [], season: [], volume: [] })
  })

  it('спрос — сумма отслеживаемых тем с цифрами; отключённая не в счёт', () => {
    const o = demandOverview(all, 7)
    expect(o.topics).toBe(4)
    expect(o.withData).toBe(3)
    expect(o.monthly).toBe(1350)
    expect(o.series![0]).toBe(1150)
    expect(o.series![23]).toBe(1350)
    expect(o.dataUntil).toBe('2026-10-01')
    expect(o.newQueries).toBe(7)
  })

  it('рост — как у темы: последние 3 месяца к тем же год назад', () => {
    // (3·1350 − 3·1150) / (3·1150) = +17,4%
    expect(demandOverview(all, 0).trend).toBe(17)
    // меньше 30 поисков год назад — сравнивать не с чем
    expect(demandOverview([topic({ series: months(5, 50), volume_avg3: 50 })], 0).trend).toBeNull()
  })

  it('фильтры — как на «Спросе на рынке»: ищут, а у нас нет / растёт / скоро сезон', () => {
    const o = demandOverview(all, 0)
    expect([o.missing, o.growing, o.falling, o.season]).toEqual([1, 1, 0, 1])
    expect(o.top.missing.map(t => t.name)).toEqual(['Лабубу'])
    expect(o.top.growing.map(t => t.name)).toEqual(['Лабубу'])
    expect(o.top.season.map(t => t.name)).toEqual(['Ледянки'])
    expect(o.top.volume.map(t => t.name)).toEqual(['Куклы', 'Лабубу', 'Ледянки'])
  })

  it('строка темы — спрос, рост, ряд и наши товары', () => {
    expect(demandOverview(all, 0).top.volume[0]).toEqual({
      id: 'Куклы',
      name: 'Куклы',
      volume: 1000,
      trend: 0,
      series: months(1000),
      peakMonth: null,
      ourTotal: 5,
      ourInStock: 3,
    })
  })

  it('растущие — по росту, при равном — по спросу; в списке не больше пяти', () => {
    const grow = [10, 40, 40, 90, 25, 60, 30].map((trend, i) => topic({ name: `Т${i}`, series: months(100), volume_avg3: 100 + i, trend_pct: trend + 15, our_total: 1 }))
    const o = demandOverview(grow, 0)
    expect(o.growing).toBe(7)
    expect(o.top.growing.map(t => t.name)).toEqual(['Т3', 'Т5', 'Т2', 'Т1', 'Т6'])
  })
})

describe('refreshesLeft', () => {
  it('сколько обновлений по $0,18 хватит остатка', () => {
    expect(refreshesLeft(0.6412)).toBe(3)
    expect(refreshesLeft(0.36)).toBe(2)
    expect(refreshesLeft(0.18)).toBe(1)
    expect(refreshesLeft(0.17)).toBe(0)
    expect(refreshesLeft(-0.5)).toBe(0)
  })
})

describe('seriesMonths', () => {
  it('24 месяца, последний — месяц данных, через Новый год', () => {
    const m = seriesMonths('2026-10-01', 24)
    expect(m).toHaveLength(24)
    expect(m[0]).toBe('2024-11-01')
    expect(m[2]).toBe('2025-01-01')
    expect(m[23]).toBe('2026-10-01')
    expect(seriesMonths('2026-01-01', 2)).toEqual(['2025-12-01', '2026-01-01'])
  })
})

describe('nextAutoRefresh', () => {
  const at = (iso: string) => new Date(iso)
  it('5-го в 9:30 по Алматы — в этом месяце, если ещё не наступило', () => {
    expect(nextAutoRefresh(null, at('2026-11-03T10:00:00Z'))).toBe('2026-11-05T04:30:00.000Z')
    expect(nextAutoRefresh(null, at('2026-11-05T04:00:00Z'))).toBe('2026-11-05T04:30:00.000Z')
  })
  it('прошло — в следующем, и через Новый год', () => {
    expect(nextAutoRefresh(null, at('2026-11-05T05:00:00Z'))).toBe('2026-12-05T04:30:00.000Z')
    expect(nextAutoRefresh(null, at('2026-12-20T00:00:00Z'))).toBe('2027-01-05T04:30:00.000Z')
  })
  it('обновляли меньше 20 дней назад — этот раз пропустит', () => {
    // 3 ноября обновили вручную: 5 ноября пропуск, следующее — 5 декабря
    expect(nextAutoRefresh('2026-11-02T20:30:00Z', at('2026-11-03T10:00:00Z'))).toBe('2026-12-05T04:30:00.000Z')
    // 10 октября — к 5 ноября прошло 26 дней
    expect(nextAutoRefresh('2026-10-10T08:00:00Z', at('2026-11-03T10:00:00Z'))).toBe('2026-11-05T04:30:00.000Z')
  })
})
