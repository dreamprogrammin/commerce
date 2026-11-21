import type { VercelUsage } from '@/utils/vercelUsage'
import { describe, expect, it } from 'vitest'
import { aggregateCharges, billingMonthStart, forecastMonth, vercelHints } from '@/utils/vercelUsage'

/** Расход Vercel в админке (21.11.2026): разбор JSONL /v1/billing/charges, прогноз, подсказки. Цифры придуманы. */

const line = (name: string, q: number, unit: string, eff: number, billed = 0) => JSON.stringify({ ServiceName: name, ConsumedQuantity: q, ConsumedUnit: unit, EffectiveCost: eff, BilledCost: billed })

describe('aggregateCharges', () => {
  it('строки одной услуги складываются, мусор пропускается, дорогие — первыми', () => {
    const s = aggregateCharges([line('ISR Writes', 300, 'Writes', 0.5), line('Build CPU Minutes', 40, 'minute', 2), line('ISR Writes', 400, 'Writes', 0.7, 0.1), 'не json', '', '{"broken'].join('\n'))
    expect(s.map(x => [x.name, x.quantity, Math.round(x.effective * 100) / 100, x.billed])).toEqual([
      ['Build CPU Minutes', 40, 2, 0],
      ['ISR Writes', 700, 1.2, 0.1],
    ])
  })
})

describe('месяц и прогноз', () => {
  it('месяц Vercel начинается в полночь по Лос-Анджелесу: летом UTC−7, зимой UTC−8', () => {
    // 1 ноября 2026 летнее время кончается в 2 ночи — полночь ещё по UTC−7, как у CLI Vercel
    expect(billingMonthStart(new Date('2026-11-21T15:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z')
    expect(billingMonthStart(new Date('2027-01-15T00:00:00Z')).toISOString()).toBe('2027-01-01T08:00:00.000Z')
    expect(billingMonthStart(new Date('2026-07-10T00:00:00Z')).toISOString()).toBe('2026-07-01T07:00:00.000Z')
    // 1 декабря 05:00 UTC — в Лос-Анджелесе ещё 30 ноября
    expect(billingMonthStart(new Date('2026-12-01T05:00:00Z')).toISOString()).toBe('2026-11-01T07:00:00.000Z')
  })
  it('прогноз по темпу; в первые сутки — нет', () => {
    const start = new Date('2026-11-01T08:00:00Z')
    expect(forecastMonth(3, start, new Date('2026-11-11T08:00:00Z'))).toBe(9)
    expect(forecastMonth(3, start, new Date('2026-11-01T20:00:00Z'))).toBeNull()
  })
})

function usage(over: Partial<VercelUsage>): VercelUsage {
  return { periodStart: '', periodEnd: '', services: [], effective: 0, billed: 0, forecast: null, deploys: [], ...over }
}

describe('vercelHints', () => {
  it('сверх тарифа — предупреждение', () => {
    expect(vercelHints(usage({ billed: 3.456 }))[0]).toEqual({ level: 'warn', text: 'Сверх включённого в Pro уже $3,46 — это придёт в счёт в конце месяца.' })
  })
  it('главная статья от 40% — по-русски и с советом; тариф Pro не считается расходом', () => {
    const services = aggregateCharges([line('Pro', 0, 'USD', 20), line('ISR Writes', 2e6, 'Writes', 6), line('Fluid Active CPU', 3, 'hour', 3)].join('\n'))
    const h = vercelHints(usage({ services }))
    expect(h).toHaveLength(1)
    expect(h[0]!.text).toMatch(/^Пересборки кеша страниц — 67% расхода \(\$6\)\. Страницы пересобираются часто/)
  })
  it('меньше доллара — не советуем', () => {
    expect(vercelHints(usage({ services: aggregateCharges(line('ISR Writes', 700, 'Writes', 0.003)) }))).toEqual([])
  })
  it('упавшие сборки', () => {
    const h = vercelHints(usage({ deploys: [
      { target: 'preview', state: 'ERROR', createdAt: '', branch: 'dev', message: null },
      { target: 'production', state: 'ERROR', createdAt: '', branch: 'master', message: null },
    ] }))
    expect(h.map(x => x.text)).toEqual([
      'Последняя сборка боевого сайта упала — uhti.kz работает на предыдущей. Причину нужно разобрать до следующей выкатки.',
      'Превью (dev) не собралось — dev.uhti.kz показывает прежнюю сборку.',
    ])
  })
})
