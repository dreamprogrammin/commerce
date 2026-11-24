import { plural } from './restockOrder'
import { modelLabel, VISION_PRICES } from './supplierOfferList'

/**
 * Во что обошёлся один запрос к модели — строка «Расход» в карточке
 * «Тексты от ИИ» (24 ноября 2026). Владелец: «может туда еще показывать
 * состояние сколько было использовано токенов и конвертация в тенге».
 *
 * Вход и выход — по VISION_PRICES. Кеш промпта — по своим ценам Anthropic
 * на 24.11.2026: запись в 5-минутный кеш — 1,25 цены входа, чтение — 0,05
 * у Sonnet 5.5 и Opus 5.5, 0,1 у остальных. Журнал расхода (ai_usage_daily)
 * так не умеет: там весь вход одной ценой, поэтому здесь цена точнее.
 */

/** Токены одного ответа модели — поля usage Anthropic */
export interface AiRequestTokens {
  /** Вход мимо кеша */
  input: number
  /** Вход, записанный в кеш */
  cacheWrite: number
  /** Вход, прочитанный из кеша */
  cacheRead: number
  output: number
}

/** Официальный курс Нацбанка РК */
export interface UsdKzt {
  /** Тенге за доллар */
  kzt: number
  /** Дата курса — как в ленте Нацбанка, ДД.ММ.ГГГГ */
  date: string
  /** Свежий курс не получен — это прежний или зашитый в код */
  stale?: boolean
}

/** Расход «Текстов для сайта» в ответе сервера */
export interface AiRequestUsage extends AiRequestTokens {
  /** null — курса нет, цена только в долларах */
  rate: UsdKzt | null
}

/**
 * Бюджет ИИ на момент ответа (24.11.2026) — строки «Описания … с …» и
 * «Бюджет ИИ: осталось … — примерно на N таких описаний». Владелец: «нужно
 * показывать сколько было использовано токенов и сколько осталось в
 * эквиваленте можно сгенерировать описаний». Счёт тот же, что у батарейки
 * «Бюджет ИИ» (server/utils/usageMeters.ts): журнал, весь вход одной ценой.
 */
export interface WriterBudget {
  /** Сумма бюджета, $; null — бюджет не задан */
  budgetUsd: number | null
  /** С какого дня считается расход, по Алматы: начало периода бюджета, без бюджета — 30 дней назад */
  since: string
  /** Все модели с `since` по журналу, $; null — цены какой-то модели нет */
  spentUsd: number | null
  /**
   * Токены модели описаний с `since` по журналу. Денег здесь нет: журнал считает вход одной ценой, и у первого
   * описания сумма разошлась бы со строкой «Расход», посчитанной точно, — деньги только в остатке бюджета
   */
  writer: { input: number, output: number }
}

const CACHE_WRITE_SHARE = 1.25
const CACHE_READ_SHARE: Record<string, number> = {
  'anthropic/claude-sonnet-5-5': 0.05,
  'anthropic/claude-opus-5-5': 0.05,
}

/** $ за запрос; null — цен модели в таблице нет */
export function aiRequestUsd(model: string, t: AiRequestTokens): number | null {
  const price = VISION_PRICES[model]
  if (!price)
    return null
  const [input, output] = price
  const read = CACHE_READ_SHARE[model] ?? 0.1
  return (t.input * input + t.cacheWrite * input * CACHE_WRITE_SHARE + t.cacheRead * input * read + t.output * output) / 1e6
}

const NBSP = '\u00A0'
const fixed = (n: number, digits: number) => n.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
const count = (n: number, one: string, few: string, many: string) => `${n.toLocaleString('ru-RU')} ${plural(n, one, few, many)}`
const dayMonth = (ymd: string) => new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: 'numeric', month: 'long' }).format(new Date(`${ymd}T12:00:00Z`))

/** «8,1 ₸» — до 10 ₸ с десятыми, дальше целыми с разрядами; знак не отрывается от числа */
export function formatAiKzt(kzt: number): string {
  return `${kzt < 10 ? fixed(kzt, 1) : Math.round(kzt).toLocaleString('ru-RU')}${NBSP}₸`
}

/** «$0,018» — меньше доллара три знака: центы и их доли; дальше два */
export function formatAiUsd(usd: number): string {
  return `$${fixed(usd, usd < 1 ? 3 : 2)}`
}

/** Две строки для карточки: что потрачено и по какому курсу */
export function aiUsageLines(model: string, u: AiRequestUsage): { spent: string, rate: string | null } {
  const input = u.input + u.cacheWrite + u.cacheRead
  const total = input + u.output
  const tokens = `${total.toLocaleString('ru-RU')} ${plural(total, 'токен', 'токена', 'токенов')} (запрос ${input.toLocaleString('ru-RU')}, ответ ${u.output.toLocaleString('ru-RU')})`
  const usd = aiRequestUsd(model, u)
  if (usd == null)
    return { spent: `Расход: ${tokens} — цены этой модели в таблице нет`, rate: null }
  if (!u.rate)
    return { spent: `Расход: ${tokens} ≈ ${formatAiUsd(usd)}`, rate: null }
  return {
    spent: `Расход: ${tokens} ≈ ${formatAiKzt(usd * u.rate.kzt)} · ${formatAiUsd(usd)}`,
    rate: `Курс Нацбанка на ${u.rate.date}: ${fixed(u.rate.kzt, 2)}${NBSP}₸ за $${u.rate.stale ? ' — свежий курс не получен' : ''}`,
  }
}

/** Сколько ушло на описания и на сколько описаний хватит остатка бюджета — по цене этого описания */
export function aiBudgetLines(model: string, b: WriterBudget, u: AiRequestUsage): { writer: string, left: string } {
  const period = b.budgetUsd == null ? 'за 30 дней' : `с ${dayMonth(b.since)}`
  const tokens = count(b.writer.input + b.writer.output, 'токен', 'токена', 'токенов')
  const writer = `Описания (${modelLabel(model)}) ${period}: ${tokens}`
  if (b.budgetUsd == null)
    return { writer, left: 'Бюджет ИИ не задан — задайте сумму на счёте Anthropic в «Умном закупе», карточка «Бюджет ИИ»: здесь будет видно, на сколько описаний хватит' }
  if (b.spentUsd == null)
    return { writer, left: 'Остаток бюджета не посчитать: цены одной из моделей нет в таблице' }
  const rest = b.budgetUsd - b.spentUsd
  if (rest <= 0)
    return { writer, left: `Бюджет ИИ по журналу исчерпан (${formatAiUsd(b.spentUsd)} из ${formatAiUsd(b.budgetUsd)}) — пополните счёт Anthropic и задайте сумму заново в «Умном закупе»` }
  const of = `${formatAiUsd(rest)} из ${formatAiUsd(b.budgetUsd)}`
  const per = aiRequestUsd(model, u)
  const n = per ? Math.floor(rest / per) : null
  const enough = n == null ? '' : n ? ` — примерно на ${count(n, 'такое описание', 'таких описания', 'таких описаний')}` : ' — меньше, чем на одно такое описание'
  return { writer, left: `Бюджет ИИ: осталось ≈ ${u.rate ? `${formatAiKzt(rest * u.rate.kzt)} (${of})` : of}${enough}` }
}
