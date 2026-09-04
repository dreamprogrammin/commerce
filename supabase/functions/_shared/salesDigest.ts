/**
 * Сводка по продажам — владельцу дважды в день.
 *
 * ЗАЧЕМ. Владелец попросил, чтобы бот «давал мотивации на продажи»: план,
 * товарооборот, процент выполнения, сравнение с прошлыми периодами — утром
 * в 9 как задача на день и в 22 как итог перед закрытием.
 *
 * ЧТО СЧИТАЕМ ЧЕСТНО. Всё, кроме конверсии, берётся из заказов и их позиций:
 * товарооборот, число заказов, средний чек, штук в заказе (UPT), отмены,
 * выкупленное. Конверсия требует трафика, а его в базе нет вовсе:
 * `product_views` пуста, серверных корзин единицы. Поэтому CR приходит из GA4
 * и только если доступ настроен — иначе строки просто нет. Придумывать
 * конверсию из числа заказов нельзя: это была бы не метрика, а украшение.
 *
 * ОБОРОТ СЧИТАЕТСЯ ПО ОФОРМЛЕННЫМ заказам без отменённых, а не по доставленным.
 * Доставка занимает дни, и вечерняя сводка по выкупленному всегда показывала бы
 * ноль. Выкупленное идёт отдельной строкой — чтобы разрыв было видно.
 */

import { formatAmount } from './orderCard.ts'

/** Часовой пояс магазина: Казахстан весь на UTC+5, перевода часов нет. */
const ALMATY_OFFSET_MIN = 5 * 60

export type DigestSlot = 'morning' | 'evening'

export interface OrderRow {
  id: string
  table: 'orders' | 'guest_checkouts'
  status: string
  final_amount: number | string | null
  created_at: string
}

export interface PeriodStats {
  orders: number
  revenue: number
  cancelled: number
  delivered: number
  deliveredRevenue: number
  units: number
  /** Средний чек. */
  average: number
  /** Штук в заказе (UPT). */
  upt: number
}

function almaty(date: Date): Date {
  return new Date(date.getTime() + ALMATY_OFFSET_MIN * 60000)
}

/** Полночь по Алматы `daysBack` дней назад — в настоящем UTC. */
export function midnight(now: Date, daysBack = 0): Date {
  const local = almaty(now)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(local.getUTCDate() - daysBack)
  return new Date(local.getTime() - ALMATY_OFFSET_MIN * 60000)
}

/** Первое число месяца по Алматы, `monthsBack` месяцев назад. */
export function monthStart(now: Date, monthsBack = 0): Date {
  const local = almaty(now)
  local.setUTCHours(0, 0, 0, 0)
  local.setUTCDate(1)
  local.setUTCMonth(local.getUTCMonth() - monthsBack)
  return new Date(local.getTime() - ALMATY_OFFSET_MIN * 60000)
}

/** Сколько дней в текущем месяце и какой сегодня день месяца — по Алматы. */
export function monthProgress(now: Date): { day: number, days: number } {
  const local = almaty(now)
  const day = local.getUTCDate()
  const days = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0)).getUTCDate()
  return { day, days }
}

const FIELDS = 'id, status, final_amount, created_at'

/** Заказы обеих таблиц за период. */
export async function fetchOrders(
  supabase: { from: (t: string) => any },
  from: Date,
  to: Date,
): Promise<OrderRow[]> {
  const rows: OrderRow[] = []

  for (const table of ['orders', 'guest_checkouts'] as const) {
    const { data, error } = await supabase
      .from(table)
      .select(FIELDS)
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())

    if (error)
      console.error(`Сводка: не прочитать ${table}:`, error.message)

    for (const row of (data ?? []) as OrderRow[])
      rows.push({ ...row, table })
  }

  return rows
}

/** Сколько товарных единиц в этих заказах. */
export async function fetchUnits(
  supabase: { from: (t: string) => any },
  rows: OrderRow[],
): Promise<number> {
  const orderIds = rows.filter(r => r.table === 'orders').map(r => r.id)
  const guestIds = rows.filter(r => r.table === 'guest_checkouts').map(r => r.id)
  let units = 0

  if (orderIds.length) {
    const { data } = await supabase.from('order_items').select('quantity').in('order_id', orderIds)
    units += (data ?? []).reduce((s: number, i: { quantity: number }) => s + Number(i.quantity ?? 0), 0)
  }

  if (guestIds.length) {
    const { data } = await supabase.from('guest_checkout_items').select('quantity').in('checkout_id', guestIds)
    units += (data ?? []).reduce((s: number, i: { quantity: number }) => s + Number(i.quantity ?? 0), 0)
  }

  return units
}

const DELIVERED = ['delivered', 'completed']

export function summarize(rows: OrderRow[], units: number): PeriodStats {
  const alive = rows.filter(r => r.status !== 'cancelled')
  const revenue = alive.reduce((s, r) => s + Number(r.final_amount ?? 0), 0)
  const delivered = rows.filter(r => DELIVERED.includes(r.status))

  return {
    orders: alive.length,
    revenue,
    cancelled: rows.length - alive.length,
    delivered: delivered.length,
    deliveredRevenue: delivered.reduce((s, r) => s + Number(r.final_amount ?? 0), 0),
    units,
    average: alive.length ? Math.round(revenue / alive.length) : 0,
    upt: alive.length ? Math.round((units / alive.length) * 10) / 10 : 0,
  }
}

/**
 * Посещения из GA4. Возвращает `null`, если доступ не настроен, — тогда строки
 * с конверсией в сводке просто не будет.
 *
 * Ключ сервисного аккаунта лежит в переменной окружения целиком, JSON строкой.
 */
export async function ga4Sessions(from: Date, to: Date): Promise<number | null> {
  const propertyId = Deno.env.get('GA4_PROPERTY_ID')
  const raw = Deno.env.get('GA4_SERVICE_ACCOUNT')
  if (!propertyId || !raw)
    return null

  try {
    const sa = JSON.parse(raw) as { client_email: string, private_key: string }
    const token = await googleToken(sa, 'https://www.googleapis.com/auth/analytics.readonly')
    if (!token)
      return null

    const day = (d: Date) => almaty(d).toISOString().slice(0, 10)

    const res = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateRanges: [{ startDate: day(from), endDate: day(new Date(to.getTime() - 1)) }],
          metrics: [{ name: 'sessions' }],
        }),
      },
    )

    const data = await res.json()
    if (!res.ok) {
      console.error('GA4 отказал:', JSON.stringify(data).slice(0, 200))
      return null
    }

    return Number(data?.rows?.[0]?.metricValues?.[0]?.value ?? 0)
  }
  catch (e) {
    console.error('GA4: не удалось получить сессии:', e)
    return null
  }
}

/** Токен сервисного аккаунта Google: JWT подписывается RS256 через Web Crypto. */
async function googleToken(
  sa: { client_email: string, private_key: string },
  scope: string,
): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`

  // PEM → DER: убираем обёртку и переводим base64 в байты.
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0))

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned)),
  )
  const signed = `${unsigned}.${btoa(String.fromCharCode(...signature))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signed,
    }),
  })

  const data = await res.json()
  if (!res.ok) {
    console.error('Google не выдал токен:', JSON.stringify(data).slice(0, 200))
    return null
  }

  return data.access_token as string
}

/** Разница в процентах, с уже готовым знаком. */
function delta(now: number, before: number): string {
  if (!before)
    return now ? 'впервые за сравнимый период' : 'как и тогда — пусто'
  const pct = Math.round(((now - before) / before) * 100)
  if (pct === 0)
    return 'ровно столько же'
  return pct > 0 ? `+${pct}%` : `${pct}%`
}

export interface DigestInput {
  slot: DigestSlot
  now: Date
  today: PeriodStats
  yesterday: PeriodStats
  weekAgo: PeriodStats
  month: PeriodStats
  prevMonthSoFar: PeriodStats
  plan: SalesPlan | null
  sessions: number | null
  monthSessions: number | null
}

/** Готовый текст сводки. Разметка — Markdown первой версии, как везде у бота. */
export function digestMessage(input: DigestInput): string {
  const { slot, now, today, yesterday, weekAgo, month, prevMonthSoFar, plan, sessions } = input
  const { day, days } = monthProgress(now)
  const left = Math.max(days - day + (slot === 'morning' ? 1 : 0), 0)

  const lines: string[] = []

  lines.push(slot === 'morning' ? '☀️ *План на день*' : '🌙 *Итог дня*')
  lines.push('')

  if (slot === 'evening' || today.orders > 0) {
    lines.push(`*Сегодня:* ${today.orders} ${plural(today.orders, 'заказ', 'заказа', 'заказов')} на ${formatAmount(today.revenue)}`)
    if (today.orders > 0)
      lines.push(`Средний чек ${formatAmount(today.average)} · штук в заказе ${today.upt}`)
    if (today.cancelled)
      lines.push(`Отменено: ${today.cancelled}`)
    if (today.delivered)
      lines.push(`Выкуплено: ${today.delivered} на ${formatAmount(today.deliveredRevenue)}`)
  }
  else {
    lines.push('*Сегодня:* заказов пока нет.')
  }

  lines.push('')
  lines.push(`*Вчера:* ${yesterday.orders} на ${formatAmount(yesterday.revenue)} (${delta(today.revenue, yesterday.revenue)})`)
  lines.push(`*Тот же день неделю назад:* ${weekAgo.orders} на ${formatAmount(weekAgo.revenue)}`)

  lines.push('')
  lines.push(`*Месяц:* ${month.orders} ${plural(month.orders, 'заказ', 'заказа', 'заказов')} на ${formatAmount(month.revenue)}`)
  lines.push(`Прошлый месяц к этому дню: ${formatAmount(prevMonthSoFar.revenue)} (${delta(month.revenue, prevMonthSoFar.revenue)})`)

  if (plan) {
    const target = plan.amount
    const pct = Math.round((month.revenue / target) * 100)
    const perDay = Math.round(target / days)
    const remains = Math.max(target - month.revenue, 0)
    const needPerDay = left > 0 ? Math.round(remains / left) : remains

    lines.push('')
    lines.push(`*План месяца:* ${formatAmount(target)} — выполнено *${pct}%*`)
    lines.push(`_${planExplanation(plan)}_`)
    lines.push(`Норма дня ${formatAmount(perDay)}`)

    if (remains === 0)
      lines.push('🎉 План закрыт. Всё, что дальше, — сверху.')
    else if (left > 0)
      lines.push(`Осталось ${formatAmount(remains)} за ${left} ${plural(left, 'день', 'дня', 'дней')} — по ${formatAmount(needPerDay)} в день`)
    else
      lines.push(`До плана не хватило ${formatAmount(remains)}`)

    // Опережение считаем от нормы на прошедшие дни, а не от всего плана:
    // иначе первого числа «отставание» равнялось бы плану целиком.
    const shouldBe = Math.round((target / days) * (slot === 'morning' ? day - 1 : day))
    const diff = month.revenue - shouldBe
    if (shouldBe > 0)
      lines.push(diff >= 0 ? `Идём с опережением на ${formatAmount(diff)}` : `Отставание ${formatAmount(-diff)}`)
  }
  else {
    lines.push('')
    lines.push('_Плана нет: продаж в истории слишком мало, чтобы посчитать его самому. Поставьте вручную: `/plan 300000`._')
  }

  if (sessions !== null && sessions > 0) {
    const cr = Math.round((today.orders / sessions) * 1000) / 10
    lines.push('')
    lines.push(`*Конверсия сегодня:* ${cr}% (${today.orders} из ${sessions} визитов)`)
  }

  lines.push('')
  lines.push(slot === 'morning'
    ? '_Считаем по оформленным заказам без отменённых._'
    : '_Считаем по оформленным заказам без отменённых. Выкупленное приходит позже — оно отдельной строкой._')

  return lines.join('\n')
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

export interface PlanBasis {
  /** Средняя выручка в день за окно наблюдения. */
  perDay: number
  /** Во сколько раз последние 30 дней отличаются от предыдущих 30. */
  trend: number
  /** Насколько план выше факта — чтобы он тянул вверх, а не повторял прошлое. */
  ambition: number
  /** Живых (не отменённых) заказов в окне. По нему судим, можно ли верить цифре. */
  orders: number
  /** Окно наблюдения в днях. */
  window: number
}

export interface SalesPlan {
  amount: number
  source: 'auto' | 'manual'
  basis: PlanBasis | null
}

/** Насколько план ставится выше факта. 15% — заметно, но достижимо. */
const AMBITION = 1.15

/** Коридор для тренда: на малых числах он скачет, и без ограничения план прыгал бы втрое. */
const TREND_MIN = 0.8
const TREND_MAX = 1.5

/** Меньше этого числа живых заказов — истории мало, план ориентировочный. */
export const ENOUGH_ORDERS = 10

/** Окно наблюдения: 90 дней сглаживают всплески вроде одного крупного заказа. */
const WINDOW_DAYS = 90

/**
 * Считает план месяца по истории продаж.
 *
 * ЗАЧЕМ ИМЕННО ТАК. Владелец попросил, чтобы план считался сам. Взять «среднее
 * за прошлый месяц» нельзя: у магазина бывают месяцы, где все заказы отменены
 * (август 2026 — 9 заказов, 9 отмен, ноль выручки), и план на сентябрь вышел бы
 * нулевым. Поэтому окно 90 дней, тренд считается отдельно и зажат в коридор
 * 0.8–1.5, а сверху добавляется 15% амбиции.
 *
 * Формула целиком: план = средняя выручка в день за 90 дней × тренд × 1.15 ×
 * число дней в месяце, округлённое до 10 000 вверх.
 *
 * Если живых заказов в окне меньше десяти, цифре верить рано — план всё равно
 * ставится, но сводка честно говорит, что он ориентировочный.
 */
export async function computePlan(
  supabase: { from: (t: string) => any },
  now: Date = new Date(),
): Promise<{ amount: number, basis: PlanBasis }> {
  const windowFrom = midnight(now, WINDOW_DAYS)
  const rows = await fetchOrders(supabase, windowFrom, now)
  const alive = rows.filter(r => r.status !== 'cancelled')
  const revenue = alive.reduce((s, r) => s + Number(r.final_amount ?? 0), 0)

  const recentFrom = midnight(now, 30)
  const prevFrom = midnight(now, 60)
  const sum = (from: Date, to: Date) => alive
    .filter(r => {
      const t = new Date(r.created_at).getTime()
      return t >= from.getTime() && t < to.getTime()
    })
    .reduce((s, r) => s + Number(r.final_amount ?? 0), 0)

  const recent = sum(recentFrom, now)
  const previous = sum(prevFrom, recentFrom)

  // Тренд считаем, только когда есть с чем сравнивать: иначе он либо ноль,
  // либо бесконечность, и то и другое одинаково бессмысленно.
  const rawTrend = previous > 0 ? recent / previous : 1
  const trend = Math.min(Math.max(rawTrend, TREND_MIN), TREND_MAX)

  const perDay = revenue / WINDOW_DAYS
  const { days } = monthProgress(now)
  const raw = perDay * trend * AMBITION * days

  // Округляем вверх до 10 000: «46 231 ₸» выглядит как ошибка расчёта, а не
  // как цель. Ноль оставляем нулём — выдумывать план на пустой истории нельзя.
  const amount = raw > 0 ? Math.ceil(raw / 10000) * 10000 : 0

  return {
    amount,
    basis: {
      perDay: Math.round(perDay),
      trend: Math.round(trend * 100) / 100,
      ambition: AMBITION,
      orders: alive.length,
      window: WINDOW_DAYS,
    },
  }
}

/**
 * План текущего месяца. Если его нет — считает и запоминает.
 *
 * Запоминает намеренно: посчитанный на лету план менялся бы каждый день вместе
 * с окном, и «процент выполнения» скакал бы вверх-вниз при неизменных
 * продажах. Цель, которая меняется сама, целью быть перестаёт.
 */
export async function ensurePlan(
  supabase: { from: (t: string) => any },
  now: Date = new Date(),
): Promise<SalesPlan | null> {
  const month = monthStart(now).toISOString().slice(0, 10)

  const { data } = await supabase
    .from('sales_plans')
    .select('amount, source, basis')
    .eq('month', month)
    .maybeSingle()

  const row = data as { amount?: number, source?: 'auto' | 'manual', basis?: PlanBasis } | null
  if (row?.amount)
    return { amount: Number(row.amount), source: row.source ?? 'manual', basis: row.basis ?? null }

  const { amount, basis } = await computePlan(supabase, now)
  if (amount <= 0)
    return null

  await supabase.from('sales_plans').upsert({
    month,
    amount,
    source: 'auto',
    basis,
    updated_at: new Date().toISOString(),
    updated_by: null,
  }, { onConflict: 'month' })

  return { amount, source: 'auto', basis }
}

/** Записать план вручную — перебивает автоматический. */
export async function setPlan(
  supabase: { from: (t: string) => any },
  amount: number,
  telegramUserId: number,
  now: Date = new Date(),
): Promise<void> {
  await supabase.from('sales_plans').upsert({
    month: monthStart(now).toISOString().slice(0, 10),
    amount,
    source: 'manual',
    basis: null,
    updated_at: new Date().toISOString(),
    updated_by: telegramUserId,
  }, { onConflict: 'month' })
}

/** Пересчитать автоматический план заново, забыв прежний. */
export async function resetPlanToAuto(
  supabase: { from: (t: string) => any },
  now: Date = new Date(),
): Promise<SalesPlan | null> {
  const month = monthStart(now).toISOString().slice(0, 10)
  const { amount, basis } = await computePlan(supabase, now)

  if (amount <= 0) {
    await supabase.from('sales_plans').delete().eq('month', month)
    return null
  }

  await supabase.from('sales_plans').upsert({
    month,
    amount,
    source: 'auto',
    basis,
    updated_at: new Date().toISOString(),
    updated_by: null,
  }, { onConflict: 'month' })

  return { amount, source: 'auto', basis }
}

/** Строка «откуда взялась цифра» — чтобы план не выглядел взятым с потолка. */
export function planExplanation(plan: SalesPlan): string {
  if (plan.source === 'manual')
    return 'Поставлен вручную'

  const b = plan.basis
  if (!b)
    return 'Посчитан ботом по истории продаж'

  const parts = [`по ${formatAmount(b.perDay)} в день за ${b.window} дней`]
  if (b.trend !== 1)
    parts.push(`тренд ×${b.trend}`)
  parts.push(`амбиция ×${b.ambition}`)

  const tail = b.orders < ENOUGH_ORDERS
    ? `. Живых заказов в истории всего ${b.orders} — цифра ориентировочная`
    : ''

  return `Посчитан ботом: ${parts.join(', ')}${tail}`
}

/** Собрать сводку целиком: чтение, счёт, текст. Один вызов на кнопку и на расписание. */
export async function buildDigest(
  supabase: { from: (t: string) => any },
  slot: DigestSlot,
  now: Date = new Date(),
): Promise<string> {
  const dayStart = midnight(now, 0)
  const yesterdayStart = midnight(now, 1)
  const weekAgoStart = midnight(now, 7)
  const monthFrom = monthStart(now)
  const prevMonthFrom = monthStart(now, 1)
  const { day } = monthProgress(now)

  // Прошлый месяц берём ровно столько же дней, сколько прошло в этом, —
  // иначе сравнение всегда не в пользу текущего.
  const prevMonthTo = new Date(prevMonthFrom)
  prevMonthTo.setUTCDate(prevMonthTo.getUTCDate() + day)

  const [todayRows, yesterdayRows, weekAgoRows, monthRows, prevRows] = await Promise.all([
    fetchOrders(supabase, dayStart, now),
    fetchOrders(supabase, yesterdayStart, dayStart),
    fetchOrders(supabase, weekAgoStart, midnight(now, 6)),
    fetchOrders(supabase, monthFrom, now),
    fetchOrders(supabase, prevMonthFrom, prevMonthTo),
  ])

  const [todayUnits, yesterdayUnits, weekUnits, monthUnits, prevUnits] = await Promise.all([
    fetchUnits(supabase, todayRows),
    fetchUnits(supabase, yesterdayRows),
    fetchUnits(supabase, weekAgoRows),
    fetchUnits(supabase, monthRows),
    fetchUnits(supabase, prevRows),
  ])

  return digestMessage({
    slot,
    now,
    today: summarize(todayRows, todayUnits),
    yesterday: summarize(yesterdayRows, yesterdayUnits),
    weekAgo: summarize(weekAgoRows, weekUnits),
    month: summarize(monthRows, monthUnits),
    prevMonthSoFar: summarize(prevRows, prevUnits),
    plan: await ensurePlan(supabase, now),
    sessions: await ga4Sessions(dayStart, now),
    monthSessions: null,
  })
}
