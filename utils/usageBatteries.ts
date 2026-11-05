import type { RateLimit } from '../supabase/functions/_shared/supplierVisionCore'
import type { VisionModelSpend } from './supplierOfferList'
import { formatUsd } from './marketDemand'
import { plural } from './restockOrder'
import { visionCost } from './supplierOfferList'

/**
 * «Батарейки» дашборда «Умный закуп» (6 ноября 2026). Владелец 5.11: «давай
 * введем батарейку здоровье сколько у нас там осталась таких запросов итд
 * если есть ресет тоже можно вести». Выбраны четыре: бюджет ИИ, лимит
 * запросов ИИ, баланс DataForSEO, сбор Telegram. Трафик Supabase и лимиты
 * Vercel через API не отдаются — их здесь нет.
 *
 * Сервер (server/utils/usageMeters.ts) отдаёт показания, здесь из них —
 * уровень, состояние и подписи.
 */

/** Бюджет ИИ — ключ 'ai_budget' в ai_settings */
export interface AiBudget {
  usd: number
  /** С какого дня (по Алматы, YYYY-MM-DD) считаем расход */
  since: string
  /** День месяца сброса, 1–28; null — без сброса (пополнение счёта) */
  resetDay: number | null
}

export interface AiLimitsReading {
  provider: string
  model: string
  /** Когда снято — время последнего ответа модели */
  seenAt: string
  requests: RateLimit | null
  inputTokens: RateLimit | null
  outputTokens: RateLimit | null
  tokens: RateLimit | null
}

export interface UsageMeters {
  /** Миграция 20261106120000_usage_meters применена */
  installed: boolean
  aiBudget: AiBudget | null
  /** Расход моделей с начала периода бюджета (или за 30 дней без бюджета) */
  aiSpend: VisionModelSpend[]
  aiLimits: AiLimitsReading | null
  /** null — ключа DataForSEO нет */
  dataforseo: { balance: number | null, total: number | null, dayLimit: number | null, daySpent: number | null, error: string | null } | null
  /** null — каналов ещё нет в базе */
  telegram: { channels: number, collectedToday: number, lastCollectedAt: string | null, floodUntil: string | null, floodChannel: string | null } | null
}

export type BatteryState = 'ok' | 'low' | 'empty' | 'off'

export interface Battery {
  id: 'ai_budget' | 'ai_limits' | 'dataforseo' | 'telegram'
  title: string
  state: BatteryState
  /** 0–1; null — шкалы нет (нечего мерить) */
  level: number | null
  value: string
  note: string | null
  /** Когда сброс — фразой; null — сброса нет или он не известен */
  reset: string | null
}

const TZ = 'Asia/Almaty'
const LOW = 0.2

const almatyDate = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: TZ }).format(d)
const dayMonth = (d: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'long' }).format(d)
const clock = (d: Date) => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(d)
const count = (n: number, one: string, few: string, many: string) => `${n.toLocaleString('ru-RU')} ${plural(n, one, few, many)}`

function stateOf(level: number): BatteryState {
  return level <= 0 ? 'empty' : level < LOW ? 'low' : 'ok'
}

/** Сегодня до сброса — «в 14:05», другой день — «6 ноября в 14:05» */
function when(at: Date, now: Date): string {
  return almatyDate(at) === almatyDate(now) ? `в ${clock(at)}` : `${dayMonth(at)} в ${clock(at)}`
}

/**
 * Период бюджета: с какого дня считать расход и когда сброс. Со сбросом —
 * с последнего дня сброса, но не раньше дня, когда бюджет задан; без
 * сброса — с того дня. Дни — по Алматы, YYYY-MM-DD.
 */
export function budgetPeriod(budget: AiBudget, now: Date): { start: string, nextReset: string | null } {
  if (!budget.resetDay)
    return { start: budget.since, nextReset: null }
  const [y, m, d] = almatyDate(now).split('-').map(Number) as [number, number, number]
  const iso = (yy: number, mm: number) => {
    const t = new Date(Date.UTC(yy, mm - 1, budget.resetDay!))
    return t.toISOString().slice(0, 10)
  }
  const last = d >= budget.resetDay ? iso(y, m) : iso(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1)
  const next = d >= budget.resetDay ? iso(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1) : iso(y, m)
  return { start: last > budget.since ? last : budget.since, nextReset: next }
}

function aiBudgetBattery(m: UsageMeters, now: Date): Battery {
  const base = { id: 'ai_budget' as const, title: 'Бюджет ИИ' }
  // Без журнала расхода остаток вышел бы полным — не показываем
  if (!m.installed)
    return { ...base, state: 'off', level: null, value: 'нет данных', note: 'Появится после миграции базы.', reset: null }
  if (!m.aiBudget)
    return { ...base, state: 'off', level: null, value: 'не задан', note: 'Задайте сумму на счёте провайдера — покажу, сколько осталось.', reset: null }
  const spent = visionCost(m.aiSpend)
  const { start, nextReset } = budgetPeriod(m.aiBudget, now)
  const startDate = new Date(`${start}T12:00:00Z`)
  const reset = nextReset ? `сброс ${dayMonth(new Date(`${nextReset}T12:00:00Z`))}` : 'без сброса — до пополнения счёта'
  if (spent == null)
    return { ...base, state: 'off', level: null, value: `${formatUsd(m.aiBudget.usd)}`, note: 'Цена выбранной модели не известна — расход не посчитать.', reset }
  const left = Math.max(0, m.aiBudget.usd - spent)
  const level = m.aiBudget.usd > 0 ? left / m.aiBudget.usd : 0
  const posts = m.aiSpend.reduce((n, s) => n + s.posts, 0)
  return {
    ...base,
    state: stateOf(level),
    level,
    value: `${formatUsd(left)} из ${formatUsd(m.aiBudget.usd)}`,
    note: `Потрачено ${spent > 0 && spent < 0.01 ? 'меньше $0,01' : formatUsd(spent)} с ${dayMonth(startDate)} — ${count(posts, 'чтение', 'чтения', 'чтений')}.`,
    reset,
  }
}

const LIMIT_NAMES = [
  ['requests', 'запросов', 'запроса', 'запросов'],
  ['inputTokens', 'токенов входа', 'токенов входа', 'токенов входа'],
  ['outputTokens', 'токенов выхода', 'токенов выхода', 'токенов выхода'],
  ['tokens', 'токенов', 'токена', 'токенов'],
] as const

function aiLimitsBattery(m: UsageMeters, now: Date): Battery {
  const base = { id: 'ai_limits' as const, title: 'Лимит запросов ИИ' }
  const r = m.aiLimits
  if (!r)
    return { ...base, state: 'off', level: null, value: 'нет данных', note: 'Появится после первого чтения модели — провайдер сообщает лимит в каждом ответе.', reset: null }
  const shown = LIMIT_NAMES.flatMap(([key, ...words]) => {
    const l = r[key]
    return l?.limit && l.remaining != null ? [{ l, level: l.remaining / l.limit, words: words as [string, string, string] }] : []
  })
  if (!shown.length)
    return { ...base, state: 'off', level: null, value: 'нет данных', note: 'Провайдер не сообщил лимит.', reset: null }
  // Слабое место — то, чего осталось меньше всего
  const worst = shown.reduce((a, b) => b.level < a.level ? b : a)
  const resetAt = worst.l.reset ? new Date(worst.l.reset) : null
  // Сброс уже прошёл — лимит снова полный, хоть показание и старое
  if (resetAt && resetAt.getTime() <= now.getTime()) {
    return { ...base, state: 'ok', level: 1, value: 'полный', note: `${count(worst.l.limit!, ...worst.words)} в минуту; по последнему чтению ${when(new Date(r.seenAt), now)}.`, reset: null }
  }
  return {
    ...base,
    state: stateOf(worst.level),
    level: worst.level,
    value: `${worst.l.remaining!.toLocaleString('ru-RU')} из ${count(worst.l.limit!, ...worst.words)}`,
    note: `По последнему ответу модели ${when(new Date(r.seenAt), now)}.`,
    reset: resetAt ? `сброс ${when(resetAt, now)}` : null,
  }
}

function dataforseoBattery(m: UsageMeters): Battery {
  const base = { id: 'dataforseo' as const, title: 'Баланс DataForSEO' }
  const d = m.dataforseo
  if (!d)
    return { ...base, state: 'off', level: null, value: 'ключа нет', note: 'Задайте ключ на странице «Спрос на рынке».', reset: null }
  if (d.balance == null)
    return { ...base, state: 'off', level: null, value: 'не узнать', note: d.error, reset: null }
  const level = d.total ? Math.min(1, d.balance / d.total) : null
  // Дневной лимит трат — только если он меньше остатка, иначе он ничего не ограничивает
  const day = d.dayLimit && d.dayLimit < d.balance && d.daySpent != null ? d.dayLimit - d.daySpent : null
  return {
    ...base,
    state: d.balance <= 0 ? 'empty' : level != null ? stateOf(level) : 'ok',
    level,
    value: d.total ? `${formatUsd(d.balance)} из ${formatUsd(d.total)}` : formatUsd(d.balance),
    note: day != null ? `На сегодня можно ещё ${formatUsd(Math.max(0, day))} из дневного лимита ${formatUsd(d.dayLimit)}.` : d.total ? 'Из всех пополнений счёта.' : null,
    reset: day != null ? 'дневной лимит — сброс в полночь' : 'без сброса — до пополнения счёта',
  }
}

function telegramBattery(m: UsageMeters, now: Date): Battery {
  const base = { id: 'telegram' as const, title: 'Сбор Telegram' }
  const t = m.telegram
  if (!t || !t.channels)
    return { ...base, state: 'off', level: null, value: 'каналов нет', note: 'Добавьте каналы поставщиков.', reset: null }
  const flood = t.floodUntil && Date.parse(t.floodUntil) > now.getTime() ? new Date(t.floodUntil) : null
  const level = t.collectedToday / t.channels
  const last = t.lastCollectedAt ? `последний сбор ${when(new Date(t.lastCollectedAt), now)}` : 'ещё не собирали'
  if (flood) {
    return {
      ...base,
      state: 'empty',
      // Собирать сейчас нельзя — шкала пустая, а не доля собранного красным
      level: 0,
      value: 'Telegram просит подождать',
      note: `${t.floodChannel ? `Канал «${t.floodChannel}». ` : ''}Закрытые каналы — после сброса; открытые собираются.`,
      reset: `можно ${when(flood, now)}`,
    }
  }
  return {
    ...base,
    state: t.collectedToday ? 'ok' : 'low',
    level,
    value: `сегодня ${t.collectedToday} из ${count(t.channels, 'канала', 'каналов', 'каналов')}`,
    note: `Ограничений Telegram нет; ${last}.`,
    reset: null,
  }
}

export function usageBatteries(m: UsageMeters, now = new Date()): Battery[] {
  return [aiBudgetBattery(m, now), aiLimitsBattery(m, now), dataforseoBattery(m), telegramBattery(m, now)]
}
