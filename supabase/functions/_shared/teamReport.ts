/**
 * Отчёт по работе команды — владельцу.
 *
 * ЗАЧЕМ. Владелец видит поток заказов в рабочем чате, но не видит картины:
 * кто из менеджеров сколько провёл, кто из курьеров сколько отвёз, много ли
 * отмен и по чьей вине. Раньше это можно было узнать только запросом в базу.
 *
 * ЧТО СЧИТАЕМ И ЧЕГО НЕ СЧИТАЕМ. В базе есть время оформления заказа
 * (`created_at`), время, когда менеджер взял его в работу (`assigned_at`), и
 * время, когда курьер забрал доставку (`courier_taken_at`). Времени
 * подтверждения, отгрузки и доставки НЕТ — «доставлен» это статус, а не
 * отметка времени. Поэтому «сколько заказ ехал» отчёт не показывает: такую
 * цифру пришлось бы выдумать. Всё остальное считается по тому, что есть.
 *
 * Период берётся по дате ОФОРМЛЕНИЯ заказа. При нынешнем потоке (6–9 заказов
 * в месяц) это самая понятная ось: «вот заказы за неделю, вот что с ними
 * стало». Иначе пришлось бы объяснять, почему заказ прошлой недели попал в
 * отчёт этой.
 */

import { formatAmount } from './orderCard.ts'
import { escapeMarkdown } from './telegramUtils.ts'

/**
 * Часовой пояс магазина. Казахстан с 1 марта 2024 года весь на UTC+5, перевода
 * часов нет — поэтому обходимся сдвигом, без базы часовых поясов.
 */
const ALMATY_OFFSET_MIN = 5 * 60

/** `d` — сегодня, `w` — 7 дней, `m` — 30 дней, `lw` — прошлая неделя пн–вс. */
export type ReportPeriod = 'd' | 'w' | 'm' | 'lw'

export interface ReportRange {
  from: Date
  to: Date
  title: string
  /** Подпись под заголовком: какие именно дни попали в отчёт. */
  days: string
}

const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/** Дата глазами Алматы: сдвигаем и дальше работаем в UTC-полях. */
function almaty(date: Date): Date {
  return new Date(date.getTime() + ALMATY_OFFSET_MIN * 60000)
}

/** Полночь по Алматы, `daysBack` дней назад, в настоящем UTC. */
function midnight(now: Date, daysBack: number): Date {
  const local = almaty(now)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - daysBack)
  return new Date(local.getTime() - ALMATY_OFFSET_MIN * 60000)
}

function dayLabel(date: Date): string {
  const local = almaty(date)
  return `${local.getUTCDate()} ${MONTHS[local.getUTCMonth()]}`
}

export function reportRange(period: ReportPeriod, now: Date = new Date()): ReportRange {
  if (period === 'd') {
    const from = midnight(now, 0)
    return { from, to: now, title: 'Отчёт за сегодня', days: dayLabel(now) }
  }

  if (period === 'w') {
    const from = midnight(now, 6)
    return { from, to: now, title: 'Отчёт за 7 дней', days: `${dayLabel(from)} — ${dayLabel(now)}` }
  }

  if (period === 'm') {
    const from = midnight(now, 29)
    return { from, to: now, title: 'Отчёт за 30 дней', days: `${dayLabel(from)} — ${dayLabel(now)}` }
  }

  /*
   * Прошлая календарная неделя, понедельник — воскресенье. Это период
   * автоотчёта: он приходит в понедельник утром, и «за 7 дней» в нём читалось
   * бы криво — половина недели уже новая.
   */
  const weekday = almaty(now).getUTCDay() // 0 — воскресенье
  const monday = midnight(now, (weekday + 6) % 7)
  const from = new Date(monday.getTime() - 7 * 24 * 3600 * 1000)
  const lastDay = new Date(monday.getTime() - 1000)
  return {
    from,
    to: monday,
    title: 'Отчёт за прошлую неделю',
    days: `${dayLabel(from)} — ${dayLabel(lastDay)}`,
  }
}

export interface ReportOrder {
  status: string
  final_amount: number | string | null
  created_at: string
  assigned_admin_name: string | null
  assigned_admin_username: string | null
  assigned_at: string | null
  cancelled_by: string | null
  courier_name: string | null
  courier_taken_at: string | null
  delivery_method: string | null
}

const FIELDS = [
  'status', 'final_amount', 'created_at',
  'assigned_admin_name', 'assigned_admin_username', 'assigned_at',
  'cancelled_by', 'courier_name', 'courier_taken_at', 'delivery_method',
].join(', ')

/** Заказы обеих таблиц за период. Гостевые и пользовательские считаются вместе. */
/**
 * Клиент Supabase. Тип нарочно широкий: функции зовут и вебхук, и team-report,
 * а клиенты там созданы по-разному — нужен только `.from`.
 */
// deno-lint-ignore no-explicit-any
export type ReportDb = { from: (table: any) => any }

export async function fetchReportOrders(
  supabase: ReportDb,
  range: ReportRange,
): Promise<ReportOrder[]> {
  const rows: ReportOrder[] = []

  for (const table of ['orders', 'guest_checkouts']) {
    const { data, error } = await supabase
      .from(table)
      .select(FIELDS)
      .gte('created_at', range.from.toISOString())
      .lt('created_at', range.to.toISOString())

    if (error)
      console.error(`Отчёт: не прочитать ${table}:`, error.message)

    rows.push(...((data ?? []) as ReportOrder[]))
  }

  return rows
}

interface PersonStats {
  name: string
  took: number
  delivered: number
  cancelled: number
  inWork: number
  /** Сумма задержек «оформлен → взят в работу», в минутах. Только у менеджеров. */
  waitMinutes: number
  waitCount: number
}

function person(map: Map<string, PersonStats>, name: string): PersonStats {
  const key = name.toLowerCase()
  let found = map.get(key)
  if (!found) {
    found = { name, took: 0, delivered: 0, cancelled: 0, inWork: 0, waitMinutes: 0, waitCount: 0 }
    map.set(key, found)
  }
  return found
}

function line(stats: PersonStats, withWait: boolean): string {
  const parts: string[] = []
  if (stats.delivered)
    parts.push(`доставлено ${stats.delivered}`)
  if (stats.cancelled)
    parts.push(`отменено ${stats.cancelled}`)
  if (stats.inWork)
    parts.push(`в работе ${stats.inWork}`)

  let text = `• ${escapeMarkdown(stats.name)} — ${stats.took} ${plural(stats.took, 'заказ', 'заказа', 'заказов')}`
  if (parts.length)
    text += `: ${parts.join(', ')}`

  if (withWait && stats.waitCount) {
    const avg = Math.round(stats.waitMinutes / stats.waitCount)
    text += `; берёт в среднем за ${humanMinutes(avg)}`
  }

  return text
}

export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11)
    return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return few
  return many
}

export function humanMinutes(minutes: number): string {
  if (minutes < 60)
    return `${minutes} ${plural(minutes, 'минуту', 'минуты', 'минут')}`
  const hours = Math.round(minutes / 60)
  if (hours < 24)
    return `${hours} ${plural(hours, 'час', 'часа', 'часов')}`
  const days = Math.round(hours / 24)
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`
}

const CANCELLED_BY: Record<string, string> = {
  client: 'клиент',
  user: 'клиент',
  admin: 'менеджер',
  system: 'автоматически',
}

/** Готовый текст отчёта. Разметка — Markdown первой версии, как везде у бота. */
export function reportMessage(orders: ReportOrder[], range: ReportRange): string {
  const head = `📊 *${range.title}*\n_${range.days}_`

  if (orders.length === 0)
    return `${head}\n\nЗаказов не было.`

  const delivered = orders.filter(o => o.status === 'delivered' || o.status === 'completed')
  const cancelled = orders.filter(o => o.status === 'cancelled')
  const inWork = orders.length - delivered.length - cancelled.length

  const revenue = delivered.reduce((sum, o) => sum + Number(o.final_amount ?? 0), 0)
  const average = delivered.length ? Math.round(revenue / delivered.length) : 0

  const totals = [
    `Заказов: *${orders.length}*`,
    `доставлено ${delivered.length}`,
    `отменено ${cancelled.length}`,
    `в работе ${inWork}`,
  ].join(' · ')

  const money = delivered.length
    ? `Выкуплено на ${formatAmount(revenue)}, средний чек ${formatAmount(average)}`
    : 'Выкупленных заказов за период нет'

  const blocks = [head, '', totals, money]

  if (cancelled.length) {
    const byWhom = new Map<string, number>()
    for (const order of cancelled) {
      const who = CANCELLED_BY[order.cancelled_by ?? ''] ?? 'не указано'
      byWhom.set(who, (byWhom.get(who) ?? 0) + 1)
    }
    blocks.push(`Отмены: ${[...byWhom].map(([who, n]) => `${who} ${n}`).join(', ')}`)
  }

  // ── менеджеры ───────────────────────────────────────────────────────────
  const managers = new Map<string, PersonStats>()
  let unassigned = 0

  for (const order of orders) {
    if (!order.assigned_admin_name) {
      unassigned++
      continue
    }

    const stats = person(managers, order.assigned_admin_name)
    stats.took++
    if (order.status === 'delivered' || order.status === 'completed')
      stats.delivered++
    else if (order.status === 'cancelled')
      stats.cancelled++
    else
      stats.inWork++

    if (order.assigned_at) {
      const wait = (new Date(order.assigned_at).getTime() - new Date(order.created_at).getTime()) / 60000
      // Отрицательное время означало бы правку данных руками — такое не считаем.
      if (wait >= 0) {
        stats.waitMinutes += wait
        stats.waitCount++
      }
    }
  }

  blocks.push('', '*Менеджеры*')
  if (managers.size === 0)
    blocks.push('Никто не брал заказы в работу.')
  else
    blocks.push(...[...managers.values()].sort((a, b) => b.took - a.took).map(s => line(s, true)))
  if (unassigned)
    blocks.push(`• Без менеджера: ${unassigned}`)

  // ── курьеры ─────────────────────────────────────────────────────────────
  const couriers = new Map<string, PersonStats>()
  for (const order of orders) {
    if (!order.courier_name)
      continue
    const stats = person(couriers, order.courier_name)
    stats.took++
    if (order.status === 'delivered' || order.status === 'completed')
      stats.delivered++
    else if (order.status === 'cancelled')
      stats.cancelled++
    else
      stats.inWork++
  }

  const pickup = orders.filter(o => (o.delivery_method ?? '').toLowerCase().includes('pickup')).length

  blocks.push('', '*Курьеры*')
  if (couriers.size === 0)
    blocks.push('Доставки никто не брал.')
  else
    blocks.push(...[...couriers.values()].sort((a, b) => b.took - a.took).map(s => line(s, false)))
  if (pickup)
    blocks.push(`• Самовывоз: ${pickup} ${plural(pickup, 'заказ', 'заказа', 'заказов')} — курьер не нужен`)

  blocks.push('', '_Считаем по дате оформления заказа._')

  return blocks.join('\n')
}

/** Кнопки выбора периода. Префикс свой, чтобы не путаться с кнопками заказов. */
export const REPORT_PREFIX = 'rep'

export function reportKeyboard() {
  return {
    inline_keyboard: [[
      { text: 'Сегодня', callback_data: `${REPORT_PREFIX}:d` },
      { text: '7 дней', callback_data: `${REPORT_PREFIX}:w` },
      { text: '30 дней', callback_data: `${REPORT_PREFIX}:m` },
    ]],
  }
}

export function parseReportData(data: string): ReportPeriod | null {
  const [prefix, period] = data.split(':')
  if (prefix !== REPORT_PREFIX)
    return null
  return period === 'd' || period === 'w' || period === 'm' || period === 'lw' ? period : null
}

/** Собрать и вернуть готовый текст: один вызов на команду, кнопку и автоотчёт. */
export async function buildReport(
  supabase: ReportDb,
  period: ReportPeriod,
  now: Date = new Date(),
): Promise<string> {
  const range = reportRange(period, now)
  return reportMessage(await fetchReportOrders(supabase, range), range)
}
