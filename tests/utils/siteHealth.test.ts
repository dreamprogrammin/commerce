import type { PaidService, SiteHealthPage } from '@/utils/siteHealth'
import { describe, expect, it } from 'vitest'
import { siteHealthLine } from '@/utils/siteHealth'

/** Строка «батарейки» над продажами на дашборде (21.11.2026). Цифры придуманы. */

const NOW = new Date('2026-11-21T12:00:00Z')
const service = (over: Partial<PaidService>): PaidService => ({ id: 'x', name: 'Сервис', plan: '', cost: null, currency: 'USD', period: 'month', renewsOn: null, url: null, note: '', meter: null, sort: 0, ...over })
function page(over: Partial<SiteHealthPage> = {}): SiteHealthPage {
  return {
    installed: true,
    site: { last: { at: '2026-11-21T11:58:00Z', ok: true, ms: 840, error: null }, uptime24: 1, uptime7: 0.995, avgMs24: 900, down: null, incidents: [] },
    services: [],
    readings: {},
    vercel: { installed: true, key: null, usage: null, hints: [], error: null },
    ...over,
  }
}

describe('siteHealthLine', () => {
  it('всё в порядке: «Сайт работает», доступность и ответ, внимания не требует', () => {
    expect(siteHealthLine(page(), NOW)).toEqual({ state: 'ok', headline: 'Сайт работает', facts: ['за сутки 100%', 'ответ 0,8 с'], alerts: [] })
  })
  it('сайт лежит — причина первой и красная', () => {
    const l = siteHealthLine(page({ site: { last: { at: '2026-11-21T11:58:00Z', ok: false, ms: 300, error: '402' }, uptime24: 0.9, uptime7: 0.98, avgMs24: 800, down: { since: '2026-11-21T11:40:00Z', reason: '402 — Vercel остановил проект (лимиты или оплата)' }, incidents: [] } }), NOW)
    expect(l.headline).toBe('Сайт не открывается')
    expect(l.state).toBe('empty')
    expect(l.facts).toEqual([])
    expect(l.alerts[0]).toEqual({ level: 'bad', text: '402 — Vercel остановил проект (лимиты или оплата)' })
  })
  it('продление в ближайшую неделю, доплата Vercel, упавшая боевая сборка, пустой счётчик', () => {
    const l = siteHealthLine(page({
      services: [service({ name: 'Vercel', renewsOn: '2026-11-24' }), service({ name: 'Домен', renewsOn: '2027-03-01' })],
      readings: { dataforseo: { id: 'dataforseo', title: 'DataForSEO', state: 'empty', level: 0, value: 'баланс $0', note: '', reset: null } },
      vercel: { installed: true, key: { last4: 'abcd', teamName: 't', updatedAt: '' }, hints: [], error: null, usage: { periodStart: '', periodEnd: '', services: [], effective: 30, billed: 2.5, forecast: null, deploys: [{ target: 'production', state: 'ERROR', createdAt: '', branch: 'master', message: null }] } },
    }), NOW)
    expect(l.alerts).toEqual([
      { level: 'warn', text: 'Vercel: продление 24 ноября, через 3 дн' },
      { level: 'warn', text: 'Vercel: сверх тарифа $2,50' },
      { level: 'bad', text: 'Vercel: сборка uhti.kz упала' },
      { level: 'bad', text: 'DataForSEO: баланс $0' },
    ])
  })
  it('сторож ещё не проверял — «Нет проверок», серая', () => {
    const l = siteHealthLine(page({ site: { last: null, uptime24: null, uptime7: null, avgMs24: null, down: null, incidents: [] } }), NOW)
    expect([l.state, l.headline, l.facts]).toEqual(['off', 'Нет проверок', ['сторож ещё не проверял']])
  })
})
