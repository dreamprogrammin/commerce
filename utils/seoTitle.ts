/**
 * Заголовок страницы товара для выдачи.
 *
 * Google обрезает title примерно на 60 знаках. Названия товаров в каталоге
 * описательные — в среднем 94 знака, максимум 131, — поэтому целиком они не
 * помещаются никогда, и обрезать их приходится нам, а не поисковику: так мы
 * сами решаем, где закончить, и не оставляем оборванное слово.
 */

/** Служебные слова, которые нельзя оставлять последними: «Погоня за | Ухтышка». */
const TRAILING_STOP_WORDS = new Set([
  'и',
  'в',
  'на',
  'с',
  'со',
  'для',
  'из',
  'по',
  'от',
  'к',
  'о',
  'об',
  'за',
  'до',
  'при',
  'под',
  'над',
  'без',
  'а',
  'но',
  'или',
  'что',
  'как',
])

/** Хвостовая пунктуация, которая после обрезки повисает в воздухе. */
const DANGLING = ' \t,.;:—–-'

/**
 * Обрезать по границе слова, не длиннее limit, без висящих предлогов и знаков.
 * Строка короче лимита возвращается как есть, только без хвостовой пунктуации.
 */
export function truncateWords(text: string, limit: number): string {
  const clean = (text ?? '').trim()
  if (clean.length <= limit)
    return trimDangling(clean)

  const head = clean.slice(0, limit + 1)
  const lastSpace = head.lastIndexOf(' ')

  // Первое слово само длиннее лимита (артикул, длинное составное) — отдаём его
  // целиком: обрубок вида «Синт» хуже, чем небольшой выход за лимит.
  if (lastSpace <= 0)
    return trimDangling(clean.split(/\s+/)[0])

  const words = head.slice(0, lastSpace).split(/\s+/)

  // Хвост из служебных слов и однобуквенных огрызков смысла не несёт
  while (words.length > 1) {
    const last = words[words.length - 1].toLowerCase().replace(/[.,;:()]/g, '')
    if (TRAILING_STOP_WORDS.has(last) || last.length <= 2 || /^[—–-]+$/.test(last))
      words.pop()
    else break
  }

  return dropDashStub(trimDangling(words.join(' ')))
}

/**
 * Названия в каталоге устроены как «[модель] — [описание]». Когда обрезка
 * приходится на описание, от него остаётся огрызок: «…кран 8063E — 128»,
 * «…ZURU 71115 — яйцо». Такой хвост в выдаче читается как оборванная мысль,
 * поэтому одно-два уцелевших слова после тире отбрасываем вместе с ним.
 * Затрагивало 26 названий из 172.
 */
function dropDashStub(text: string): string {
  const separator = ' — '
  const at = text.lastIndexOf(separator)
  if (at < 0)
    return text

  const tail = text.slice(at + separator.length).trim()
  if (tail.split(/\s+/).filter(Boolean).length > 2)
    return text

  return trimDangling(text.slice(0, at))
}

function trimDangling(text: string): string {
  let end = text.length
  while (end > 0 && DANGLING.includes(text[end - 1]))
    end--
  return text.slice(0, end)
}

/** Сколько знаков отдаём названию: 48 + ' | Ухтышка' (10) = не больше 58. */
export const PRODUCT_TITLE_NAME_LIMIT = 48
export const PRODUCT_TITLE_SUFFIX = ' | Ухтышка'

/**
 * Заголовок карточки товара.
 *
 * Ни цены, ни материала здесь намеренно нет:
 *  • цена в title устаревает и расходится с фактической, а в выдачу она и так
 *    попадает из Product/offers в разметке;
 *  • материал приклеивался к названию вторым разом («…HiH02 пластик — …
 *    пластик»), хотя в названии он уже есть у большинства товаров.
 * Освободившиеся знаки отданы самому названию — оно и есть то, что ищут.
 */
export function buildProductTitle(name: string | null | undefined): string {
  const truncated = truncateWords(name ?? '', PRODUCT_TITLE_NAME_LIMIT)
  return truncated ? truncated + PRODUCT_TITLE_SUFFIX : `Товар${PRODUCT_TITLE_SUFFIX}`
}
