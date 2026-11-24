import { plural } from './restockOrder'
import { VISION_PRICES } from './supplierOfferList'

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
