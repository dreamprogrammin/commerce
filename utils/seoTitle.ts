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
  /*
   * Длинные предлоги. Их не хватало, и на проде висел заголовок «Конструктор
   * LEGO Marvel 76290 Мстители против | Ухтышка» (проверено 11 сентября
   * 2026): обрезка останавливалась ровно на «против», потому что слово
   * длиннее двух знаков и в списке его не было.
   */
  'против',
  'через',
  'перед',
  'после',
  'между',
  'около',
  'про',
  'у',
  'во',
  'ко',
  'обо',
  'из-за',
  'из-под',
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

/**
 * Название с « | Ухтышка» — не длиннее 60 знаков: 60 + 10 = 70.
 * Без суффикса — не длиннее 70.
 */
export const PRODUCT_TITLE_NAME_LIMIT = 60
export const PRODUCT_TITLE_MAX = 70
export const PRODUCT_TITLE_SUFFIX = ' | Ухтышка'

/*
 * Где в названии можно закончить: перед запятой, скобкой, числом деталей и
 * оборотом с предлогом или «и» — «…паровой каток | с водителем», «…Охота за
 * сокровищами | 404 детали». Оборот уточняет, а суть — до него.
 */
const PHRASE_BOUNDARY = /,\s|\s\(|\s(?=\d+\s(?:детал|минифигур))|\s(?:[сивуко]|со|на|для|из|во|против|без|под|над|от|до|при|по|через|за|об)\s/giu

/*
 * Оборванный оборот: предлог и прилагательное без существительного — «со
 * звуковыми». Только однозначные окончания прилагательных: «-ой», «-ей» бывают
 * и у существительных — «с горкой», «с машинкой», — такой конец законный.
 */
const DANGLING_MODIFIER = /\s(?:с|со|на|для|в|во|из|без|под|над|от|до|при|по|за|против)\s\S+(?:ыми|ими|ым|им|ых|их|ую|юю|ого|его|ому|ему)$/iu

/** Единицы и счёт после числа: «417 деталей», «55 см» — это не код модели. */
const NOT_A_CODE_NEXT = /^(?:детал|минифигур|см|мм|м$|лет|год|мес|шт|кг|г$|л$|мин|v$|в$|мп$|гц|ггц)/iu

/**
 * Коды моделей в названии: «60401», «HE0205», «T904A», «CLM-557», «M12-M/U».
 * Цифры с буквами или три цифры и больше; размеры (в том числе через русскую
 * «х»: «60х28х37»), масштабы, дроби и счёт деталей — не коды.
 */
export function modelCodes(text: string): string[] {
  const words = text.split(/\s+/)
  const codes: string[] = []
  words.forEach((raw, i) => {
    const word = raw.replace(/^[«"(]+|[»"),;:.]+$/gu, '')
    if (!/\d/.test(word) || /[×xх:.°%]/iu.test(word.replace(/^\p{L}+/u, '')) || /^\d+в\d+$/iu.test(word))
      return
    const hasLetter = /\p{L}/u.test(word)
    const digits = word.replace(/\D/g, '').length
    if (!hasLetter && digits < 3)
      return
    if (!hasLetter && NOT_A_CODE_NEXT.test(words[i + 1] ?? ''))
      return
    codes.push(word)
  })
  return codes
}

/**
 * Название для заголовка карточки.
 *
 * Что было не так (аудит 24 сентября 2026). Название резалось по слову до 48
 * знаков, и у 87 товаров из 174 обрезка приходилась на саму модель:
 * «Конструктор LEGO City 60401 Строительный паровой» — без «каток»,
 * «…60430 Межзвёздный» — без «корабль»; терялись и коды моделей — T904A,
 * HE0205, CLM-557, M12-M/U.
 *
 * Теперь: название короче лимита — целиком; иначе модель — всё до « — »,
 * описание после тире отбрасывается целиком; модель длиннее 70 — обрезается
 * по границе оборота, и только так, чтобы коды моделей остались, а на конце не
 * повис оборот без существительного.
 */
export function productTitleName(name: string | null | undefined): string {
  const clean = (name ?? '').trim().replace(/\s+/g, ' ')
  if (clean.length <= PRODUCT_TITLE_NAME_LIMIT)
    return trimDangling(clean)

  const head = trimDangling(clean.split(' — ')[0])
  if (head.length <= PRODUCT_TITLE_MAX)
    return head

  const codes = modelCodes(head)
  const cuts = [...head.matchAll(PHRASE_BOUNDARY)]
    .map(m => trimDangling(head.slice(0, m.index)))
    .filter(cut => cut.length >= 20 && cut.length <= PRODUCT_TITLE_MAX && !DANGLING_MODIFIER.test(cut) && codes.every(code => cut.includes(code)))
    .sort((a, b) => b.length - a.length)
  if (cuts[0])
    return cuts[0]

  return truncateWords(head, PRODUCT_TITLE_MAX)
}

/**
 * Заголовок карточки товара.
 *
 * Ни цены, ни материала здесь намеренно нет:
 *  • цена в title устаревает и расходится с фактической, а в выдачу она и так
 *    попадает из Product/offers в разметке;
 *  • материал приклеивался к названию вторым разом («…HiH02 пластик — …
 *    пластик»), хотя в названии он уже есть у большинства товаров.
 *
 * « | Ухтышка» — только когда влезает: сайт Google и так показывает отдельной
 * строкой над заголовком, а знаки названия важнее.
 */
export function buildProductTitle(name: string | null | undefined): string {
  const title = productTitleName(name)
  if (!title)
    return `Товар${PRODUCT_TITLE_SUFFIX}`
  return title.length <= PRODUCT_TITLE_NAME_LIMIT ? title + PRODUCT_TITLE_SUFFIX : title
}
