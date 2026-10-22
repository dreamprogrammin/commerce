/**
 * Возраст, упомянутый в названии и описании товара, — чтобы сверить его с
 * характеристикой «Возраст от» ещё в админке, до сохранения.
 *
 * Зачем. Возраст из характеристики показывает карточка («Игрушка с
 * рождения»), им работают фильтр каталога, разметка Product и фид Merchant
 * Center, а покупатель читает название. 21 октября 2026 погремушку Sky Wheel
 * ABL002-2 завели «от 3 месяцев» в названии и с пустым возрастом — на
 * странице одновременно стояло «от 3 месяцев» и «Игрушка с рождения». В
 * сентябре так же расходились 14 карточек из 178.
 *
 * Разбор — тот же, что у стража `check-product-age-text.mjs` (он проверяет
 * уже опубликованное). Страж — обычный JS в корне и TypeScript отсюда не
 * импортирует, поэтому правила продублированы: меняете здесь — поменяйте и там.
 *
 * Что считается возрастом: «от 3 лет», «с 6 месяцев», «от 1,5 до 3 лет»,
 * «3–6 лет», «от трёх лет», «от года», «с рождения», «3+». Счёт вида «35+
 * сюрпризов» или «6+ игровых элементов» — не возраст.
 */

export interface AgeMention {
  /** Возраст «от» в месяцах. */
  months: number
  /** Как написано в тексте. */
  src: string
}

const WORDS: Record<string, number> = {
  'года': 1,
  'одного года': 1,
  'полутора': 1.5,
  'двух': 2,
  'трёх': 3,
  'трех': 3,
  'четырёх': 4,
  'четырех': 4,
  'пяти': 5,
  'шести': 6,
  'семи': 7,
  'восьми': 8,
  'девяти': 9,
  'десяти': 10,
  'двенадцати': 12,
  'четырнадцати': 14,
}

const num = (s: string) => Number(String(s).replace(',', '.'))
const toMonths = (n: number, unit: string) => /мес/i.test(unit) ? Math.round(n) : Math.round(n * 12)

/** Упоминания возраста «от …» в тексте, в месяцах. */
export function ageMentions(raw: string | null | undefined): AgeMention[] {
  const t = (raw ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
  const out: AgeMention[] = []
  for (const m of t.matchAll(/(?<!\p{L})(?:от|с|со)\s+(\d+(?:[.,]\d+)?)(?:\s*(?:до|[–-])\s*\d+(?:[.,]\d+)?)?\s*(лет|года|год|мес(?:\.|яц\p{L}*)?)(?!\p{L})/giu))
    out.push({ months: toMonths(num(m[1]!), m[2]!), src: m[0] })
  for (const m of t.matchAll(/(?<![\p{L}\d.,])(\d+(?:[.,]\d+)?)\s*[–-]\s*\d+(?:[.,]\d+)?\s*(лет|года|мес(?:\.|яц\p{L}*)?)(?!\p{L})/giu)) {
    if (!/(?:от|с)\s*$/i.test(t.slice(Math.max(0, m.index - 4), m.index)))
      out.push({ months: toMonths(num(m[1]!), m[2]!), src: m[0] })
  }
  for (const m of t.matchAll(/(?<!\p{L})(?:от|с)\s+(одного года|года|полутора|двух|трёх|трех|четырёх|четырех|пяти|шести|семи|восьми|девяти|десяти|двенадцати|четырнадцати)(\s+(?:лет|года|месяцев))?(?!\p{L})/giu)) {
    const w = m[1]!.toLowerCase()
    if ((w === 'года' || w === 'одного года') && !m[2])
      out.push({ months: 12, src: m[0] })
    else if (m[2])
      out.push({ months: toMonths(WORDS[w]!, m[2]), src: m[0] })
  }
  for (const m of t.matchAll(/(?<!\p{L})(?:от|с)\s+полугода(?!\p{L})/giu))
    out.push({ months: 6, src: m[0] })
  for (const m of t.matchAll(/с\s+рождения/giu))
    out.push({ months: 0, src: m[0] })
  // «3+» — только если дальше не слово: «35+ сюрпризов» — счёт, а не возраст
  for (const m of t.matchAll(/(?<![\d+\p{L}])(\d{1,2})\+(?!\s*\p{L})(?!\d)/gu))
    out.push({ months: toMonths(num(m[1]!), 'лет'), src: m[0] })
  return out
}

/**
 * Упоминания возраста в названии и описании, которые расходятся с
 * характеристикой «Возраст от». Возраст не указан — расходится любое
 * упоминание. Повторы одной и той же фразы схлопываются.
 */
export function ageTextConflicts(input: {
  name?: string | null
  description?: string | null
  minAgeMonths: number | null | undefined
}): { where: 'название' | 'описание', src: string }[] {
  const field = input.minAgeMonths ?? null
  const seen = new Set<string>()
  const out: { where: 'название' | 'описание', src: string }[] = []
  for (const [where, text] of [['название', input.name], ['описание', input.description]] as const) {
    for (const m of ageMentions(text)) {
      const key = `${where}:${m.src.toLowerCase()}`
      if (m.months !== field && !seen.has(key)) {
        seen.add(key)
        out.push({ where, src: m.src })
      }
    }
  }
  return out
}
