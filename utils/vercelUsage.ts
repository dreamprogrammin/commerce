/**
 * Расход Vercel и подсказки в админке (21 ноября 2026). Владелец, после
 * перехода на Pro: «а ты можешь взять и в версел данные и показывать в
 * админке и давать подсказки туда».
 *
 * Vercel отдаёт расход построчно (JSONL, формат FOCUS: /v1/billing/charges) —
 * по строке на услугу и день. Здесь: разбор, сумма по услугам, прогноз на
 * месяц и подсказки, что делать. Сервер — server/utils/vercelUsage.ts.
 */

export interface VercelService {
  name: string
  /** Сколько потреблено и в чём: «Writes», «minute», «gigabyte» */
  quantity: number
  unit: string
  /** Цена потреблённого, $ (до учёта включённого в тариф) */
  effective: number
  /** Сколько из этого пойдёт в счёт сверх включённого, $ */
  billed: number
}

export interface VercelDeploy {
  target: 'production' | 'preview'
  state: string
  createdAt: string
  branch: string | null
  message: string | null
}

export interface VercelUsage {
  periodStart: string
  periodEnd: string
  services: VercelService[]
  effective: number
  billed: number
  /** Прогноз расхода услуг (без подписки) к концу месяца, $; null — месяц только начался */
  forecast: number | null
  deploys: VercelDeploy[]
}

export interface VercelHint {
  level: 'warn' | 'info'
  text: string
}

/** Подписка, а не расход: в «что дороже всего» и прогноз не входит */
const PLAN_SERVICES = new Set(['Pro', 'Hobby', 'Enterprise'])
export const isPlanService = (name: string) => PLAN_SERVICES.has(name)

/** JSONL расхода → суммы по услугам, сначала дорогие */
export function aggregateCharges(jsonl: string): VercelService[] {
  const by = new Map<string, VercelService>()
  for (const line of jsonl.split('\n')) {
    const t = line.trim()
    if (!t.startsWith('{'))
      continue
    let r: Record<string, unknown>
    try {
      r = JSON.parse(t)
    }
    catch {
      continue
    }
    const name = String(r.ServiceName ?? r.ChargeDescription ?? '').trim()
    if (!name)
      continue
    const s = by.get(name) ?? { name, quantity: 0, unit: String(r.ConsumedUnit ?? r.PricingUnit ?? ''), effective: 0, billed: 0 }
    s.quantity += Number(r.ConsumedQuantity) || 0
    s.effective += Number(r.EffectiveCost) || 0
    s.billed += Number(r.BilledCost) || 0
    by.set(name, s)
  }
  return [...by.values()].sort((a, b) => b.effective - a.effective || a.name.localeCompare(b.name))
}

/** Начало месяца Vercel: расчётный месяц у них — по Лос-Анджелесу */
export function billingMonthStart(now: Date): Date {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit' }).format(now).split('-').map(Number) as [number, number]
  // Полночь 1-го по Лос-Анджелесу: смещение берём на этот момент (зимой −8, летом −7)
  const guess = new Date(Date.UTC(y, m - 1, 1, 8))
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Los_Angeles', hour: '2-digit', hourCycle: 'h23' }).format(guess))
  return new Date(guess.getTime() - hour * 3600_000)
}

/** Прогноз к концу месяца по темпу с его начала; меньше суток — рано */
export function forecastMonth(effective: number, start: Date, now: Date): number | null {
  const elapsed = (now.getTime() - start.getTime()) / 86_400_000
  if (elapsed < 1)
    return null
  const y = start.getUTCFullYear()
  const m = start.getUTCMonth()
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return Math.round((effective / elapsed) * days * 100) / 100
}

/** Как назвать услугу владельцу */
export const SERVICE_RU: Record<string, string> = {
  'ISR Writes': 'Пересборки кеша страниц',
  'ISR Reads': 'Чтения кеша страниц',
  'Build CPU Minutes': 'Минуты сборки',
  'Fluid Active CPU': 'Процессор функций',
  'Fluid Provisioned Memory': 'Память функций',
  'Function Invocations': 'Вызовы функций',
  'Fast Data Transfer': 'Трафик к посетителям',
  'Fast Origin Transfer': 'Трафик к функциям',
  'CDN Requests': 'Запросы к сайту',
  'Image Optimization Transformation': 'Обработка картинок',
  'Image Optimization Cache Writes': 'Кеш картинок',
  'Function Storage': 'Хранение функций',
  'Deployment Storage': 'Хранение сборок',
  'Observability Events': 'Журналы',
  'Pro': 'Тариф Pro',
}

const ADVICE: Record<string, string> = {
  'ISR Writes': 'Страницы пересобираются часто. Для страниц, которые меняются редко (бренды, разделы), можно увеличить срок кеша — какие именно, видно по журналу пересборок.',
  'Build CPU Minutes': 'Главный расход — сборки. Каждая отправка в dev собирает превью: отправлять пачкой, а не по одному коммиту.',
  'Fluid Active CPU': 'Функции много считают — скорее всего, часть страниц отрисовывается без кеша. Стоит найти, какие.',
  'Fluid Provisioned Memory': 'Функции долго держат память — обычно это медленные запросы к базе или внешним API. Стоит найти самые долгие.',
  'Function Invocations': 'Много вызовов функций — запросы проходят мимо кеша. Стоит найти, какие адреса не кешируются.',
  'Fast Data Transfer': 'Много трафика к посетителям — обычно картинки или большие страницы.',
  'Fast Origin Transfer': 'Много трафика между кешем и функциями — страницы часто собираются заново.',
  'Image Optimization Transformation': 'Картинки обрабатывает Vercel. Их можно отдавать сразу из Supabase готовыми размерами.',
  'CDN Requests': 'Очень много запросов к сайту — возможно, боты. Это видно в журнале запросов Vercel.',
}

/** $20 — целые без копеек, остальное с двумя знаками: $28,10, $0,22 */
function usd(n: number): string {
  const r = Math.round(n * 100) / 100
  const whole = Number.isInteger(r) && r !== 0
  return `$${r.toLocaleString('ru-RU', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** Подсказки: счёт сверх тарифа, что дороже всего и что с этим делать, упавшие сборки */
export function vercelHints(u: VercelUsage): VercelHint[] {
  const hints: VercelHint[] = []
  if (u.billed >= 0.01)
    hints.push({ level: 'warn', text: `Сверх включённого в Pro уже ${usd(u.billed)} — это придёт в счёт в конце месяца.` })

  const usage = u.services.filter(s => !PLAN_SERVICES.has(s.name) && s.effective > 0)
  const usageTotal = usage.reduce((n, s) => n + s.effective, 0)
  const top = usage[0]
  // Мелочь не разбираем: меньше доллара за месяц — советовать нечего
  if (top && usageTotal >= 1 && top.effective / usageTotal >= 0.4) {
    const share = Math.round((top.effective / usageTotal) * 100)
    hints.push({ level: 'info', text: `${SERVICE_RU[top.name] ?? top.name} — ${share}% расхода (${usd(top.effective)}). ${ADVICE[top.name] ?? ''}`.trim() })
  }

  const prod = u.deploys.find(d => d.target === 'production')
  if (prod && prod.state === 'ERROR')
    hints.push({ level: 'warn', text: 'Последняя сборка боевого сайта упала — uhti.kz работает на предыдущей. Причину нужно разобрать до следующей выкатки.' })
  const preview = u.deploys.find(d => d.target === 'preview')
  if (preview && preview.state === 'ERROR')
    hints.push({ level: 'warn', text: `Превью${preview.branch ? ` (${preview.branch})` : ''} не собралось — dev.uhti.kz показывает прежнюю сборку.` })
  return hints
}

export function usdText(n: number): string {
  return usd(n)
}
