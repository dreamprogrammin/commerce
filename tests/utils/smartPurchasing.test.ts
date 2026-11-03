import type { PurchasingStatus } from '../../utils/smartPurchasing'
import { describe, expect, it } from 'vitest'
import { purchasingSteps } from '../../utils/smartPurchasing'

// Как на бою 3.11.2026: поставщики есть, каналов и ключей нет, спрос не обновлялся
function status(patch: Partial<PurchasingStatus> = {}): PurchasingStatus {
  return {
    suppliers: 4,
    channels: { total: 0, open: 0, suppliers: 0 },
    demand: { topics: 92, hasKey: false, running: false, lastDoneAt: null, lastFailed: false },
    ai: { providers: [], model: 'anthropic/claude-haiku-5-5' },
    restock: { atThreshold: 0, noSupplier: 0, suppliers: 0, openOrders: 0 },
    ...patch,
  }
}
const step = (s: PurchasingStatus, id: string) => purchasingSteps(s).find(x => x.id === id)!

describe('purchasingSteps', () => {
  it('шаги по порядку: откуда товар → спрос → чтение постов → сводка → заказ', () => {
    expect(purchasingSteps(status()).map(s => s.id)).toEqual(['suppliers', 'demand', 'ai', 'digest', 'order'])
  })

  it('как на бою 3.11: ждут владельца каналы, ключ DataForSEO и ключ ИИ', () => {
    const steps = purchasingSteps(status())
    expect(steps.map(s => s.state)).toEqual(['action', 'action', 'action', 'later', 'done'])
    expect(steps[0]!.facts).toEqual(['4 поставщика', 'каналов в Telegram нет'])
    expect(steps[0]!.next).toMatch(/«Каналы в Telegram»/)
    expect(steps[1]!.facts).toEqual(['92 темы', 'цифр ещё нет', 'ключ DataForSEO не задан'])
    expect(steps[1]!.next).toBe('Задайте ключ DataForSEO на странице «Спрос на рынке» и нажмите «Обновить сейчас» — около $0,18 с баланса DataForSEO.')
    expect(steps[2]!.facts).toEqual(['ключа ИИ нет'])
    expect(steps[3]!.next).toBe('Появится, когда заработают шаги 1–3.')
    expect(steps[3]!.link).toBeNull()
    expect(steps[4]!.facts).toEqual(['заказывать нечего — всё выше порога остатка'])
  })

  it('ссылки — на страницы шагов', () => {
    expect(purchasingSteps(status()).map(s => s.link?.to ?? null))
      .toEqual(['/admin/suppliers', '/admin/demand', '/admin/ai', null, '/admin/restock'])
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
      expect(s.next).toMatch(/через аккаунт Telegram/)
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
    const demand = (patch: Partial<NonNullable<PurchasingStatus['demand']>>) =>
      step(status({ demand: { topics: 92, hasKey: true, running: false, lastDoneAt: null, lastFailed: false, ...patch } }), 'demand')

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
      expect(demand({ topics: 1 }).facts[0]).toBe('1 тема')
      expect(demand({ topics: 5 }).facts[0]).toBe('5 тем')
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
