/**
 * Сторож доступности сайта (21 ноября 2026): решения без базы и сети — их
 * проверяет vitest (tests/utils/siteWatch.test.ts), а эдж-функция
 * site-watchdog только ходит в сеть и пишет в базу.
 *
 * 21.11 Vercel поставил проект на паузу: uhti.kz отдавал 402 на всё, и
 * владелец узнал об этом из ошибки в админке. Теперь сайт открывается каждые
 * 5 минут; после ДВУХ неудачных проверок подряд бот пишет владельцу (одна —
 * бывает случайной), когда сайт снова открылся — пишет ещё раз.
 */

/** Какие страницы открывать: главная и каталог — у них разный кеш */
export const WATCH_PATHS = ['/', '/catalog'] as const
export const WATCH_TIMEOUT_MS = 20_000
/** За сколько дней до продления напомнить */
export const RENEW_AHEAD_DAYS = 7
/** Проверки старше — удаляются */
export const KEEP_DAYS = 30

export interface CheckResult {
  url: string
  ok: boolean
  status: number | null
  ms: number
  error: string | null
}

export interface OpenIncident {
  id: number
  startedAt: string
  reason: string
  alertedAt: string | null
}

export type WatchAction =
  | { kind: 'none' }
  /** Первая неудача: открыть сбой, пока не писать */
  | { kind: 'open', reason: string }
  /** Вторая подряд: написать «не открывается» */
  | { kind: 'alert', reason: string, text: string }
  /** Сбой ещё идёт, уже написали — молчать, обновить причину */
  | { kind: 'ongoing', reason: string }
  /** Открылся: закрыть; text — если «не открывается» писали */
  | { kind: 'close', text: string | null }

/*
 * Время по Алматы — сдвигом UTC+5, без Intl: в edge-рантайме Supabase (Deno
 * 1.45) база поясов старая, Казахстан там ещё UTC+6 — 21.11.2026 на локальном
 * рантайме сообщение показало 13:47 вместо 12:47. Летнего времени нет.
 */
const ALMATY_MS = 5 * 3600_000
const almaty = (d: Date) => new Date(d.getTime() + ALMATY_MS)
const pad = (n: number) => String(n).padStart(2, '0')

/** Причина по ответу: у Vercel код ошибки — в заголовке x-vercel-error */
export function failureText(status: number | null, vercelError: string | null, error: string | null): string {
  if (status == null)
    return error || 'нет ответа'
  if (vercelError === 'DEPLOYMENT_DISABLED')
    return `${status} — Vercel остановил проект (лимиты или оплата)`
  return vercelError ? `${status} ${vercelError}` : `HTTP ${status}`
}

/** Открыть страницу; ошибки сети и таймаут — тоже результат, не исключение */
export async function checkPage(url: string, fetchImpl: typeof fetch = fetch, timeoutMs = WATCH_TIMEOUT_MS): Promise<CheckResult> {
  const t0 = Date.now()
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': 'uhti-site-watchdog/1', 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    })
    // Тело дочитать: время — до конца ответа, как у покупателя
    await res.arrayBuffer().catch(() => null)
    const ms = Date.now() - t0
    return res.ok
      ? { url, ok: true, status: res.status, ms, error: null }
      : { url, ok: false, status: res.status, ms, error: failureText(res.status, res.headers.get('x-vercel-error'), null) }
  }
  catch (e) {
    const ms = Date.now() - t0
    const name = (e as Error)?.name
    const error = name === 'TimeoutError' || name === 'AbortError'
      ? `не ответил за ${Math.round(timeoutMs / 1000)} с`
      : `сеть: ${String((e as Error)?.message ?? e).slice(0, 200)}`
    return { url, ok: false, status: null, ms, error }
  }
}

function clock(d: Date): string {
  const a = almaty(d)
  return `${pad(a.getUTCHours())}:${pad(a.getUTCMinutes())}`
}

/** «7 мин», «1 ч 5 мин», «2 дн 3 ч» */
export function duration(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000))
  if (min < 60)
    return `${min} мин`
  const h = Math.floor(min / 60)
  if (h < 24)
    return min % 60 ? `${h} ч ${min % 60} мин` : `${h} ч`
  const d = Math.floor(h / 24)
  return h % 24 ? `${d} дн ${h % 24} ч` : `${d} дн`
}

function host(site: string): string {
  try {
    return new URL(site).host
  }
  catch {
    return site
  }
}

/** Причина сбоя — первая неудачная страница */
export function reasonOf(results: CheckResult[]): string {
  const bad = results.filter(r => !r.ok)
  if (!bad.length)
    return ''
  const path = (u: string) => {
    try {
      return new URL(u).pathname
    }
    catch {
      return u
    }
  }
  const same = bad.every(r => r.error === bad[0]!.error)
  return same && bad.length === results.length
    ? bad[0]!.error ?? 'не открывается'
    : bad.map(r => `${path(r.url)}: ${r.error ?? 'не открывается'}`).join('; ')
}

/** Что делать по итогам проверки */
export function decide(site: string, open: OpenIncident | null, results: CheckResult[], now: Date): WatchAction {
  const failed = results.some(r => !r.ok)
  if (!failed) {
    if (!open)
      return { kind: 'none' }
    if (!open.alertedAt)
      return { kind: 'close', text: null }
    const started = new Date(open.startedAt)
    return {
      kind: 'close',
      text: `🟢 ${host(site)} снова открывается. Не открывался ${duration(now.getTime() - started.getTime())} (с ${clock(started)} до ${clock(now)}).`,
    }
  }
  const reason = reasonOf(results)
  if (!open)
    return { kind: 'open', reason }
  if (open.alertedAt)
    return { kind: 'ongoing', reason }
  return {
    kind: 'alert',
    reason,
    text: `🔴 ${host(site)} не открывается с ${clock(new Date(open.startedAt))}.\nПричина: ${reason}.\nПроверка повторяется каждые 5 минут — напишу, когда откроется.`,
  }
}

// ---------- продления ----------

export interface PaidServiceRow {
  id: string
  name: string
  plan: string
  cost: number | null
  currency: string
  renewsOn: string | null
  remindedFor: string | null
}

/** Сегодня по Алматы, YYYY-MM-DD */
export function almatyDay(d: Date): string {
  return almaty(d).toISOString().slice(0, 10)
}

/** Часы бодрствования: напоминать о продлении с 10 до 21 по Алматы */
export function awakeHour(d: Date): boolean {
  const h = almaty(d).getUTCHours()
  return h >= 10 && h < 21
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** Продления в ближайшие RENEW_AHEAD_DAYS дней, о которых ещё не напоминали */
export function dueRenewals(rows: PaidServiceRow[], now: Date): PaidServiceRow[] {
  const today = almatyDay(now)
  return rows.filter((r) => {
    if (!r.renewsOn || r.remindedFor === r.renewsOn)
      return false
    const left = daysBetween(today, r.renewsOn)
    return left >= 0 && left <= RENEW_AHEAD_DAYS
  })
}

function money(cost: number, currency: string): string {
  const n = cost.toLocaleString('ru-RU', { maximumFractionDigits: 2 }).replace(/\s/g, '\u00A0')
  return currency === 'USD' ? `$${n}` : currency === 'KZT' ? `${n} ₸` : `${n} ${currency}`
}

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']

export function renewalText(rows: PaidServiceRow[], now: Date): string {
  const today = almatyDay(now)
  const lines = rows.map((r) => {
    const left = daysBetween(today, r.renewsOn!)
    const [, m, d] = r.renewsOn!.split('-').map(Number) as [number, number, number]
    const when = left === 0 ? 'сегодня' : left === 1 ? 'завтра' : `через ${left} дн (${d} ${MONTHS[m - 1]})`
    const price = r.cost != null ? ` — ${money(r.cost, r.currency)}` : ''
    return `• ${r.name}${r.plan ? ` (${r.plan})` : ''}: продление ${when}${price}`
  })
  return `💳 Скоро продление:\n${lines.join('\n')}\nПроверьте, что на карте хватает денег.`
}
