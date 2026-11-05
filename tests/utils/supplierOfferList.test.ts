import type { Offer, OfferChannel } from '../../utils/supplierOfferList'
import { describe, expect, it } from 'vitest'
import { collectedText, dayTitle, groupOffers, isOfferStatus, modelLabel, visionCost } from '../../utils/supplierOfferList'

// 4 ноября 2026, 15:00 в Алматы (UTC+5)
const NOW = new Date('2026-11-04T10:00:00Z')
const channels: OfferChannel[] = [
  { id: 'c1', title: 'AMR Toys', supplierName: 'AmrToys', closed: false, collectedAt: null },
  { id: 'c2', title: 'AMR Toys 2', supplierName: 'AmrToys', closed: true, collectedAt: null },
  { id: 'c3', title: 'Оптом Игрушки Алматы', supplierName: 'Оптом', closed: true, collectedAt: null },
]
function offer(id: string, channelId: string, postedAt: string): Offer {
  return { id, channelId, postedAt, caption: '', postUrl: `https://t.me/x/${id}`, photoUrl: null, photoCount: 1, status: 'new', statusAt: null, items: null, readError: null }
}
const offers = [
  offer('a', 'c1', '2026-11-03T05:00:00Z'),
  offer('b', 'c3', '2026-11-04T09:00:00Z'),
  offer('c', 'c2', '2026-11-04T08:00:00Z'),
  // 23:30 3 ноября по UTC — уже 4 ноября в Алматы
  offer('d', 'c3', '2026-11-03T23:30:00Z'),
  offer('e', 'gone', '2026-10-20T10:00:00Z'),
]

describe('groupOffers', () => {
  it('по поставщикам: каналы одного поставщика — одна группа; группы и товары от свежих', () => {
    const groups = groupOffers(offers, channels, 'supplier', NOW)
    expect(groups.map(g => [g.title, g.offers.map(o => o.id)])).toEqual([
      ['Оптом', ['b', 'd']],
      ['AmrToys', ['c', 'a']],
      ['Канал удалён', ['e']],
    ])
  })

  it('по дням — по времени Алматы', () => {
    const groups = groupOffers(offers, channels, 'day', NOW)
    expect(groups.map(g => [g.title, g.offers.map(o => o.id)])).toEqual([
      ['Сегодня', ['b', 'c', 'd']],
      ['Вчера', ['a']],
      ['20 октября', ['e']],
    ])
  })

  it('списком — одна группа без заголовка; пусто — групп нет', () => {
    expect(groupOffers(offers, channels, 'none', NOW).map(g => [g.title, g.offers.length])).toEqual([['', 5]])
    expect(groupOffers([], channels, 'none', NOW)).toEqual([])
  })
})

describe('подписи времени', () => {
  it('день: сегодня, вчера, число', () => {
    expect(dayTitle('2026-11-04T01:00:00Z', NOW)).toBe('Сегодня')
    expect(dayTitle('2026-11-03T18:59:00Z', NOW)).toBe('Вчера')
    expect(dayTitle('2026-11-01T12:00:00Z', NOW)).toBe('1 ноября')
  })

  it('последний сбор канала', () => {
    expect(collectedText(null, NOW)).toBe('ещё не собирали')
    expect(collectedText('2026-11-04T09:05:00Z', NOW)).toBe('собрано сегодня в 14:05')
    expect(collectedText('2026-11-02T09:05:00Z', NOW)).toBe('собрано 2 ноября в 14:05')
  })

  it('статусы — только известные', () => {
    expect(['new', 'added', 'skipped', 'all', 1].map(isOfferStatus)).toEqual([true, true, true, false, false])
  })
})

describe('modelLabel', () => {
  it('модели Claude — как их зовёт Anthropic', () => {
    expect(modelLabel('anthropic/claude-haiku-5-5')).toBe('Claude Haiku 5.5')
    expect(modelLabel('anthropic/claude-opus-5')).toBe('Claude Opus 5')
    expect(modelLabel('anthropic/claude-sonnet-4-5')).toBe('Claude Sonnet 4.5')
  })

  it('прочие и незнакомые — как есть, без провайдера', () => {
    expect(modelLabel('openai/gpt-6.1-terra')).toBe('gpt-6.1-terra')
    expect(modelLabel('gemini/gemini-4-argon')).toBe('gemini-4-argon')
    expect(modelLabel('anthropic/claude-haiku-4-5-20251001')).toBe('claude-haiku-4-5-20251001')
  })
})

describe('visionCost', () => {
  it('по ценам моделей: вход и выход отдельно, модели складываются', () => {
    // Haiku 5.5: 2 000 000 входа × $0,10 + 300 000 выхода × $0,50 = $0,35; Sonnet 5.5: 100 000 × $2 + 10 000 × $10 = $0,30
    expect(visionCost([
      { model: 'anthropic/claude-haiku-5-5', posts: 1000, inputTokens: 2_000_000, outputTokens: 300_000 },
      { model: 'anthropic/claude-sonnet-5-5', posts: 50, inputTokens: 100_000, outputTokens: 10_000 },
    ])).toBeCloseTo(0.65, 10)
  })

  it('чтений нет — ноль; цены модели не знаем — не считаем вовсе', () => {
    expect(visionCost([])).toBe(0)
    expect(visionCost([
      { model: 'anthropic/claude-haiku-5-5', posts: 1, inputTokens: 2000, outputTokens: 300 },
      { model: 'openai/gpt-6.1-terra', posts: 1, inputTokens: 2000, outputTokens: 300 },
    ])).toBeNull()
  })
})
