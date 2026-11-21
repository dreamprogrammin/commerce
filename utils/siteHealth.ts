import type { Battery, BatteryState } from './usageBatteries'
import type { VercelHint, VercelUsage } from './vercelUsage'
import { usdText } from './vercelUsage'

/**
 * «Состояние сайта» и платные сервисы на дашборде админки (21 ноября 2026).
 * Владелец 21.11, после паузы Vercel: «в админку нужно завести батарейку
 * состояния сайта и все сервисы платные которые имеются». Проверки делает
 * эдж-функция site-watchdog (supabase/functions/_shared/siteWatch.ts), здесь —
 * подписи, разбор ввода и итог за месяц.
 */

/** Шкала как у «батареек» «Умного закупа», с любым id */
export type Gauge = Omit<Battery, 'id'> & { id: string }

export type ServicePeriod = 'month' | 'year' | 'usage'
export type ServiceCurrency = 'USD' | 'KZT' | 'EUR' | 'RUB'
export type ServiceMeter = 'vercel' | 'supabase' | 'dataforseo' | 'ai'

export interface PaidService {
  id: string
  name: string
  plan: string
  cost: number | null
  currency: ServiceCurrency
  period: ServicePeriod
  renewsOn: string | null
  url: string | null
  note: string
  meter: ServiceMeter | null
  sort: number
}

export interface SiteStatus {
  /** Последняя проверка; null — сторож ещё не проверял */
  last: { at: string, ok: boolean, ms: number | null, error: string | null } | null
  /** Доля удачных проверок; null — проверок не было */
  uptime24: number | null
  uptime7: number | null
  /** Среднее время ответа удачных проверок за 24 ч, мс */
  avgMs24: number | null
  /** Сбой идёт: с какого времени и почему */
  down: { since: string, reason: string } | null
  incidents: { startedAt: string, endedAt: string | null, reason: string }[]
}

export interface SiteHealthPage {
  installed: boolean
  site: SiteStatus | null
  services: PaidService[]
  /** Показания для строк сервисов: батарейки — как на «Умном закупе» */
  readings: Partial<Record<ServiceMeter, Gauge>>
  /** Vercel (21.11.2026): ключ, расход за месяц, сборки, подсказки */
  vercel: VercelPanel
}

export interface VercelPanel {
  /** Миграция ключа (20261121140000) применена */
  installed: boolean
  key: { last4: string, teamName: string, updatedAt: string } | null
  usage: VercelUsage | null
  hints: VercelHint[]
  error: string | null
}

/** Батарейка Vercel: шкалы нет — у Pro нет «остатка», есть расход и прогноз */
export function vercelGauge(v: VercelPanel): Gauge | null {
  if (!v.installed)
    return null
  if (!v.key)
    return { id: 'vercel', title: 'Vercel', state: 'off', level: null, value: 'ключ не задан', note: 'Задайте ключ Vercel ниже — покажу расход за месяц, сборки и подскажу, что дорого.', reset: null }
  if (v.error || !v.usage)
    return { id: 'vercel', title: 'Vercel', state: 'low', level: null, value: 'нет данных', note: v.error ?? 'Vercel не ответил.', reset: null }
  const u = v.usage
  const parts = [`расход в этом месяце ${usdText(u.effective)}`]
  if (u.forecast != null)
    parts.push(`услуги к концу месяца ≈ ${usdText(u.forecast)}`)
  return {
    id: 'vercel',
    title: 'Vercel',
    state: u.billed >= 0.01 || v.hints.some(h => h.level === 'warn') ? 'low' : 'ok',
    level: null,
    value: parts.join(', '),
    note: u.billed >= 0.01 ? `Сверх включённого в тариф: ${usdText(u.billed)}.` : 'Сверх включённого в тариф — $0.',
    reset: null,
  }
}

const PERIODS: ServicePeriod[] = ['month', 'year', 'usage']
const CURRENCIES: ServiceCurrency[] = ['USD', 'KZT', 'EUR', 'RUB']
export const PERIOD_LABEL: Record<ServicePeriod, string> = { month: 'в месяц', year: 'в год', usage: 'по факту' }

/** Ввод формы сервиса → строка таблицы или текст ошибки */
export function parsePaidService(body: any): Omit<PaidService, 'id' | 'meter' | 'sort'> | string {
  const name = String(body?.name ?? '').trim()
  if (!name || name.length > 80)
    return 'Название — от 1 до 80 знаков'
  const plan = String(body?.plan ?? '').trim()
  if (plan.length > 80)
    return 'Тариф — до 80 знаков'
  const period = PERIODS.includes(body?.period) ? body.period as ServicePeriod : null
  if (!period)
    return 'Период — месяц, год или по факту'
  const currency = CURRENCIES.includes(body?.currency) ? body.currency as ServiceCurrency : null
  if (!currency)
    return 'Валюта — USD, KZT, EUR или RUB'
  const rawCost = String(body?.cost ?? '').replace(/\s/g, '').replace(',', '.')
  const cost = rawCost === '' ? null : Number(rawCost)
  if (cost !== null && !(Number.isFinite(cost) && cost >= 0 && cost < 1e9))
    return 'Цена — число от 0'
  const rawDate = String(body?.renewsOn ?? '').trim()
  const renewsOn = rawDate === '' ? null : rawDate
  if (renewsOn !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(renewsOn) || Number.isNaN(Date.parse(`${renewsOn}T00:00:00Z`))))
    return 'Дата продления — ГГГГ-ММ-ДД'
  const rawUrl = String(body?.url ?? '').trim()
  const url = rawUrl === '' ? null : rawUrl
  if (url !== null && (!/^https:\/\/\S+$/.test(url) || url.length > 300))
    return 'Ссылка — с https://'
  const note = String(body?.note ?? '').trim()
  if (note.length > 500)
    return 'Заметка — до 500 знаков'
  return { name, plan, cost: cost === null ? null : Math.round(cost * 100) / 100, currency, period, renewsOn, url, note }
}

function money(n: number, currency: ServiceCurrency): string {
  const s = n.toLocaleString('ru-RU', { maximumFractionDigits: n < 100 ? 2 : 0 }).replace(/\s/g, '\u00A0')
  return currency === 'USD' ? `$${s}` : currency === 'KZT' ? `${s}\u00A0₸` : `${s}\u00A0${currency}`
}

export function priceLine(s: PaidService): string {
  if (s.period === 'usage')
    return s.cost != null ? `${money(s.cost, s.currency)} ${PERIOD_LABEL.usage}` : PERIOD_LABEL.usage
  if (s.cost == null)
    return 'цена не указана'
  return s.cost === 0 ? 'бесплатно' : `${money(s.cost, s.currency)} ${PERIOD_LABEL[s.period]}`
}

/** Итог в месяц по валютам: год — двенадцатой частью; «по факту» и без цены — списком */
export function monthlyTotal(list: PaidService[]): { sums: string[], usage: string[], unknown: string[] } {
  const by = new Map<ServiceCurrency, number>()
  const usage: string[] = []
  const unknown: string[] = []
  for (const s of list) {
    if (s.period === 'usage') {
      usage.push(s.name)
      continue
    }
    if (s.cost == null) {
      unknown.push(s.name)
      continue
    }
    by.set(s.currency, (by.get(s.currency) ?? 0) + (s.period === 'year' ? s.cost / 12 : s.cost))
  }
  const sums = CURRENCIES.filter(c => (by.get(c) ?? 0) > 0).map(c => money(Math.round(by.get(c)! * 100) / 100, c))
  return { sums, usage, unknown }
}

/** Сколько дней до продления по Алматы; null — даты нет */
export function daysToRenew(renewsOn: string | null, now = new Date()): number | null {
  if (!renewsOn)
    return null
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(now)
  return Math.round((Date.parse(`${renewsOn}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
}

export function renewLine(renewsOn: string | null, now = new Date()): { text: string, soon: boolean } | null {
  const d = daysToRenew(renewsOn, now)
  if (d == null)
    return null
  const date = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${renewsOn}T12:00:00Z`))
  if (d < 0)
    return { text: `продление было ${date} — обновите дату`, soon: true }
  return { text: d === 0 ? 'продление сегодня' : d === 1 ? 'продление завтра' : `продление ${date}, через ${d} дн`, soon: d <= 7 }
}

const GB = 1024 ** 3
/** Лимиты Supabase Free: база 500 МБ, файлы 1 ГБ (на других тарифах шкалы нет) */
export const SUPABASE_FREE = { db: 0.5 * GB, files: 1 * GB }

function size(bytes: number): string {
  return bytes >= GB ? `${(bytes / GB).toFixed(1).replace('.', ',')}\u00A0ГБ` : `${Math.round(bytes / 1024 ** 2)}\u00A0МБ`
}

/** Батарейка Supabase: занято базой и файлами из лимитов Free */
export function supabaseBattery(plan: string, dbBytes: number, filesBytes: number): Gauge {
  const base = { id: 'supabase', title: 'Supabase' }
  if (!/^free$/i.test(plan.trim()))
    return { ...base, state: 'off', level: null, value: `база ${size(dbBytes)}, файлы ${size(filesBytes)}`, note: 'Трафик — только в панели Supabase.', reset: null }
  const used = Math.max(dbBytes / SUPABASE_FREE.db, filesBytes / SUPABASE_FREE.files)
  const level = Math.max(0, 1 - used)
  const state: BatteryState = level <= 0 ? 'empty' : level < 0.2 ? 'low' : 'ok'
  return {
    ...base,
    state,
    level,
    value: `база ${size(dbBytes)} из 500\u00A0МБ, файлы ${size(filesBytes)} из 1\u00A0ГБ`,
    note: 'Трафик (5 ГБ в месяц на Free) — только в панели Supabase.',
    reset: null,
  }
}

const upper = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Батарейка самого сайта: уровень — доля удачных проверок за 24 ч */
export function siteBattery(s: SiteStatus | null, now = new Date()): Gauge & { headline: string } {
  const base = { id: 'site', title: 'Сайт uhti.kz', reset: null }
  if (!s?.last)
    return { ...base, state: 'off', level: null, value: 'ещё не проверялся', note: 'Сторож проверяет каждые 5 минут, как только заработает его функция.', headline: 'Нет проверок' }
  const ago = Math.max(0, Math.round((now.getTime() - new Date(s.last.at).getTime()) / 60_000))
  const agoText = ago === 0 ? 'только что' : `${ago} мин назад`
  const pct = (v: number | null) => v == null ? '—' : `${(Math.floor(v * 1000) / 10).toLocaleString('ru-RU')}%`
  const parts = [`проверено ${agoText}`]
  if (s.last.ok && s.last.ms != null)
    parts.push(`ответ ${(s.last.ms / 1000).toFixed(1).replace('.', ',')}\u00A0с`)
  parts.push(`за 24\u00A0ч — ${pct(s.uptime24)}, за 7\u00A0дней — ${pct(s.uptime7)}`)
  // Сторож молчит дольше 15 минут — сам сломался
  const stale = ago > 15
  if (s.down) {
    const since = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(s.down.since))
    return { ...base, state: 'empty', level: s.uptime24, value: `не открывается с ${since}`, note: `${s.down.reason}. ${upper(parts.join(' · '))}`, headline: 'Сайт не открывается' }
  }
  if (stale)
    return { ...base, state: 'low', level: s.uptime24, value: 'сторож молчит', note: `Последняя проверка ${agoText} — проверьте расписание «Site Watchdog» и функцию site-watchdog.`, headline: 'Нет свежих проверок' }
  return { ...base, state: s.uptime24 != null && s.uptime24 < 0.99 ? 'low' : 'ok', level: s.uptime24, value: 'открывается', note: upper(parts.join(' · ')), headline: 'Сайт работает' }
}
