import type { UsageMeters } from '@/utils/usageBatteries'
import { describe, expect, it } from 'vitest'
import { budgetPeriod, usageBatteries } from '@/utils/usageBatteries'

// 6 ноября 2026, 15:00 по Алматы
const NOW = new Date('2026-11-06T10:00:00Z')
const empty: UsageMeters = { installed: true, aiBudget: null, aiSpend: [], aiLimits: null, dataforseo: null, telegram: null }
const haiku = (inputTokens: number, outputTokens: number, posts = 10) => ({ model: 'anthropic/claude-haiku-5-5', posts, inputTokens, outputTokens })
const battery = (m: Partial<UsageMeters>, id: string, now = NOW) => usageBatteries({ ...empty, ...m }, now).find(b => b.id === id)!

describe('budgetPeriod', () => {
  it('без сброса — со дня, когда задан', () => {
    expect(budgetPeriod({ usd: 5, since: '2026-11-05', resetDay: null }, NOW)).toEqual({ start: '2026-11-05', nextReset: null })
  })
  it('сброс 1-го: с 1 ноября, следующий — 1 декабря; задан позже — с того дня', () => {
    expect(budgetPeriod({ usd: 5, since: '2026-10-01', resetDay: 1 }, NOW)).toEqual({ start: '2026-11-01', nextReset: '2026-12-01' })
    expect(budgetPeriod({ usd: 5, since: '2026-11-03', resetDay: 1 }, NOW)).toEqual({ start: '2026-11-03', nextReset: '2026-12-01' })
  })
  it('день сброса ещё не наступил — с прошлого месяца; через год', () => {
    expect(budgetPeriod({ usd: 5, since: '2026-01-01', resetDay: 20 }, NOW)).toEqual({ start: '2026-10-20', nextReset: '2026-11-20' })
    expect(budgetPeriod({ usd: 5, since: '2026-01-01', resetDay: 10 }, new Date('2026-12-15T10:00:00Z'))).toEqual({ start: '2026-12-10', nextReset: '2027-01-10' })
    expect(budgetPeriod({ usd: 5, since: '2026-01-01', resetDay: 10 }, new Date('2027-01-05T10:00:00Z'))).toEqual({ start: '2026-12-10', nextReset: '2027-01-10' })
  })
  it('день — по Алматы: 31 октября 20:00 UTC там уже 1 ноября', () => {
    expect(budgetPeriod({ usd: 5, since: '2026-01-01', resetDay: 1 }, new Date('2026-10-31T20:00:00Z')).start).toBe('2026-11-01')
  })
})

describe('бюджет ИИ', () => {
  it('без миграции — выключен, даже если задан: расход не посчитать', () => {
    expect(battery({ installed: false, aiBudget: { usd: 5, since: '2026-11-01', resetDay: null } }, 'ai_budget')).toMatchObject({ state: 'off', level: null, value: 'нет данных' })
  })
  it('не задан — выключен, с подсказкой', () => {
    expect(battery({}, 'ai_budget')).toMatchObject({ state: 'off', level: null, value: 'не задан' })
  })
  it('остаток, расход и сброс', () => {
    // 4 млн входа по $0,10 и 1 млн выхода по $0,50 — $0,90
    const b = battery({ aiBudget: { usd: 5, since: '2026-11-01', resetDay: 1 }, aiSpend: [haiku(4e6, 1e6, 2000)] }, 'ai_budget')
    expect(b).toMatchObject({ state: 'ok', value: '$4,10 из $5,00', note: 'Потрачено $0,90 с 1 ноября — 2\u00A0000 чтений.', reset: 'сброс 1 декабря' })
    expect(b.level).toBeCloseTo(0.82)
  })
  it('мало и пусто; без сброса — до пополнения', () => {
    expect(battery({ aiBudget: { usd: 1, since: '2026-11-05', resetDay: null }, aiSpend: [haiku(9e6, 0)] }, 'ai_budget')).toMatchObject({ state: 'low', value: '$0,10 из $1,00', reset: 'без сброса — до пополнения счёта' })
    expect(battery({ aiBudget: { usd: 1, since: '2026-11-05', resetDay: null }, aiSpend: [haiku(20e6, 0)] }, 'ai_budget')).toMatchObject({ state: 'empty', level: 0, value: '$0,00 из $1,00' })
  })
  it('копейки — «меньше $0,01»; цена модели не известна — без шкалы', () => {
    expect(battery({ aiBudget: { usd: 5, since: '2026-11-05', resetDay: null }, aiSpend: [haiku(2000, 300, 1)] }, 'ai_budget').note).toBe('Потрачено меньше $0,01 с 5 ноября — 1 чтение.')
    expect(battery({ aiBudget: { usd: 5, since: '2026-11-05', resetDay: null }, aiSpend: [{ model: 'openai/gpt-x', posts: 1, inputTokens: 1, outputTokens: 1 }] }, 'ai_budget')).toMatchObject({ state: 'off', level: null })
  })
})

describe('лимит запросов ИИ', () => {
  const reading = (over = {}) => ({
    provider: 'anthropic',
    model: 'anthropic/claude-haiku-5-5',
    seenAt: '2026-11-06T09:59:50Z',
    requests: { limit: 50, remaining: 45, reset: '2026-11-06T10:00:30Z' },
    inputTokens: { limit: 50000, remaining: 5000, reset: '2026-11-06T10:00:20Z' },
    outputTokens: null,
    tokens: null,
    ...over,
  })
  it('нет показаний — выключен', () => {
    expect(battery({}, 'ai_limits')).toMatchObject({ state: 'off', value: 'нет данных' })
  })
  it('по слабому месту — токены входа на 10%; сброс сегодня — временем', () => {
    expect(battery({ aiLimits: reading() }, 'ai_limits')).toMatchObject({ state: 'low', level: 0.1, value: '5\u00A0000 из 50\u00A0000 токенов входа', reset: 'сброс в 15:00', note: 'По последнему ответу модели в 14:59.' })
  })
  it('сброс уже прошёл — полный', () => {
    expect(battery({ aiLimits: reading() }, 'ai_limits', new Date('2026-11-06T10:05:00Z'))).toMatchObject({ state: 'ok', level: 1, value: 'полный', reset: null })
  })
  it('openAI — общие токены; лимит без чисел — нет данных', () => {
    expect(battery({ aiLimits: reading({ requests: null, inputTokens: null, tokens: { limit: 100, remaining: 0, reset: '2026-11-06T10:00:01Z' } }) }, 'ai_limits')).toMatchObject({ state: 'empty', value: '0 из 100 токенов' })
    expect(battery({ aiLimits: reading({ requests: { limit: null, remaining: 3, reset: null }, inputTokens: null }) }, 'ai_limits')).toMatchObject({ state: 'off' })
  })
})

describe('баланс DataForSEO', () => {
  const d = (over = {}) => ({ balance: 0.636, total: 1, dayLimit: 1000, daySpent: 0, error: null, ...over })
  it('ключа нет; баланс не узнать — причина', () => {
    expect(battery({}, 'dataforseo')).toMatchObject({ state: 'off', value: 'ключа нет' })
    expect(battery({ dataforseo: d({ balance: null, error: 'DataForSEO не ответил' }) }, 'dataforseo')).toMatchObject({ state: 'off', note: 'DataForSEO не ответил' })
  })
  it('из всех пополнений; дневной лимит больше остатка — не показываем', () => {
    expect(battery({ dataforseo: d() }, 'dataforseo')).toMatchObject({ state: 'ok', level: 0.636, value: '$0,64 из $1,00', note: 'Из всех пополнений счёта.', reset: 'без сброса — до пополнения счёта' })
  })
  it('дневной лимит меньше остатка — сколько ещё сегодня', () => {
    expect(battery({ dataforseo: d({ balance: 40, total: 50, dayLimit: 5, daySpent: 4.5 }) }, 'dataforseo')).toMatchObject({ note: 'На сегодня можно ещё $0,50 из дневного лимита $5,00.', reset: 'дневной лимит — сброс в полночь' })
  })
  it('пусто и мало', () => {
    expect(battery({ dataforseo: d({ balance: 0 }) }, 'dataforseo').state).toBe('empty')
    expect(battery({ dataforseo: d({ balance: 0.1 }) }, 'dataforseo').state).toBe('low')
  })
})

describe('сбор Telegram', () => {
  const t = (over = {}) => ({ channels: 3, collectedToday: 2, lastCollectedAt: '2026-11-06T08:30:00Z', floodUntil: null, floodChannel: null, ...over })
  it('каналов нет — выключен', () => {
    expect(battery({}, 'telegram')).toMatchObject({ state: 'off', value: 'каналов нет' })
  })
  it('сегодня собрано; без ограничений', () => {
    expect(battery({ telegram: t() }, 'telegram')).toMatchObject({ state: 'ok', value: 'сегодня 2 из 3 каналов', note: 'Ограничений Telegram нет; последний сбор в 13:30.' })
    expect(battery({ telegram: t({ channels: 1, collectedToday: 0, lastCollectedAt: null }) }, 'telegram')).toMatchObject({ state: 'low', value: 'сегодня 0 из 1 канала', note: 'Ограничений Telegram нет; ещё не собирали.' })
  })
  it('ограничение действует — когда можно; прошло — как обычно', () => {
    expect(battery({ telegram: t({ floodUntil: '2026-11-06T10:20:00Z', floodChannel: 'Опт' }) }, 'telegram')).toMatchObject({ state: 'empty', level: 0, value: 'Telegram просит подождать', reset: 'можно в 15:20', note: 'Канал «Опт». Закрытые каналы — после сброса; открытые собираются.' })
    expect(battery({ telegram: t({ floodUntil: '2026-11-06T09:00:00Z' }) }, 'telegram').state).toBe('ok')
  })
})
