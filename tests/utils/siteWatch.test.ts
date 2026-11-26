import { describe, expect, it } from 'vitest'
import { checkPage, decide, dueRenewals, duration, failureText, reasonOf, renewalText } from '../../supabase/functions/_shared/siteWatch'

/** Сторож доступности (21.11.2026): 21.11 Vercel поставил uhti.kz на паузу — 402 на всё. */

const SITE = 'https://uhti.kz'
const ok = (path: string) => ({ url: `${SITE}${path}`, ok: true, status: 200, ms: 800, error: null })
const bad = (path: string, error = '402 — Vercel остановил проект (лимиты или оплата)') => ({ url: `${SITE}${path}`, ok: false, status: 402, ms: 300, error })
const NOW = new Date('2026-11-21T07:10:00Z') // 12:10 по Алматы

describe('checkPage', () => {
  it('402 от Vercel с DEPLOYMENT_DISABLED — понятная причина', async () => {
    const f = (async () => new Response('Payment required', { status: 402, headers: { 'x-vercel-error': 'DEPLOYMENT_DISABLED' } })) as typeof fetch
    expect(await checkPage(`${SITE}/`, f)).toMatchObject({ ok: false, status: 402, error: '402 — Vercel остановил проект (лимиты или оплата)' })
  })
  it('200 — ок; сеть и таймаут — результат, не исключение', async () => {
    expect(await checkPage(`${SITE}/`, (async () => new Response('ok')) as typeof fetch)).toMatchObject({ ok: true, status: 200, error: null })
    expect(await checkPage(`${SITE}/`, (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch)).toMatchObject({ ok: false, status: null, error: 'сеть: fetch failed' })
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener('abort', () => rej(init.signal!.reason)))) as typeof fetch
    expect(await checkPage(`${SITE}/`, slow, 50)).toMatchObject({ ok: false, status: null, error: 'не ответил за 0 с' })
  })
  it('прочие коды', () => {
    expect(failureText(500, null, null)).toBe('HTTP 500')
    expect(failureText(404, 'NOT_FOUND', null)).toBe('404 NOT_FOUND')
  })
})

describe('decide', () => {
  it('всё открывается и сбоя нет — ничего', () => {
    expect(decide(SITE, null, [ok('/'), ok('/catalog')], NOW)).toEqual({ kind: 'none' })
  })
  it('первая неудача — открыть сбой молча, вторая подряд — написать', () => {
    expect(decide(SITE, null, [bad('/'), bad('/catalog')], NOW)).toEqual({ kind: 'open', reason: '402 — Vercel остановил проект (лимиты или оплата)' })
    const a = decide(SITE, { id: 1, startedAt: '2026-11-21T07:05:00Z', reason: '', alertedAt: null }, [bad('/'), bad('/catalog')], NOW)
    expect(a.kind).toBe('alert')
    expect(a.kind === 'alert' && a.text).toContain('uhti.kz не открывается с 12:05')
    expect(a.kind === 'alert' && a.text).toContain('Vercel остановил проект')
  })
  it('уже написали — молчать, пока не откроется; открылся — написать, сколько лежал', () => {
    const open = { id: 1, startedAt: '2026-11-21T05:00:00Z', reason: 'x', alertedAt: '2026-11-21T05:05:00Z' }
    expect(decide(SITE, open, [bad('/')], NOW).kind).toBe('ongoing')
    const c = decide(SITE, open, [ok('/'), ok('/catalog')], NOW)
    expect(c).toEqual({ kind: 'close', text: '🟢 uhti.kz снова открывается. Не открывался 2 ч 10 мин (с 10:00 до 12:10).' })
  })
  it('одна случайная неудача — закрыть без сообщений', () => {
    expect(decide(SITE, { id: 1, startedAt: '2026-11-21T07:05:00Z', reason: 'x', alertedAt: null }, [ok('/')], NOW)).toEqual({ kind: 'close', text: null })
  })
  it('не открывается одна страница — в причине она', () => {
    expect(reasonOf([ok('/'), bad('/catalog', 'HTTP 500')])).toBe('/catalog: HTTP 500')
  })
  it('длительность', () => {
    expect([duration(20_000), duration(7 * 60_000), duration(65 * 60_000), duration(26 * 3600_000)]).toEqual(['1 мин', '7 мин', '1 ч 5 мин', '1 дн 2 ч'])
  })
})

describe('продления', () => {
  const row = (renewsOn: string | null, remindedFor: string | null = null) => ({ id: renewsOn ?? 'x', name: 'Vercel', plan: 'Pro', cost: 20, currency: 'USD', renewsOn, remindedFor })
  it('за 0–7 дней и ещё не напоминали', () => {
    const due = dueRenewals([row('2026-11-21'), row('2026-11-28'), row('2026-11-29'), row('2026-11-20'), row(null), row('2026-11-25', '2026-11-25')], NOW)
    expect(due.map(r => r.renewsOn)).toEqual(['2026-11-21', '2026-11-28'])
  })
  it('текст', () => {
    expect(renewalText([row('2026-11-22')], NOW)).toContain('Vercel (Pro): продление завтра — $20')
    expect(renewalText([{ ...row('2026-11-25'), cost: 5000, currency: 'KZT', name: 'Домен uhti.kz', plan: '' }], NOW)).toContain('Домен uhti.kz: продление через 4 дн (25 ноября) — 5\u00A0000 ₸')
  })
})
