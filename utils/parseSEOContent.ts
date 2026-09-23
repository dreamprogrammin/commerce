export type SEOBlockType = 'h2' | 'h3' | 'p' | 'ul'

/** Кусок абзаца: текст или внутренняя ссылка. */
export interface SEOInline {
  text: string
  href?: string
}

export interface SEOBlock {
  type: SEOBlockType
  text?: string
  icon?: string
  /**
   * Абзац по кускам — только если в нём есть внутренняя ссылка. Рендер,
   * который кусков не знает, рисует `text`, как раньше (ссылки теряются).
   */
  parts?: SEOInline[]
  items?: Array<{
    text: string
    icon?: string // иконка на каждом li если есть
    parts?: SEOInline[]
  }>
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: '\u00A0',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: '\'',
}

/**
 * HTML-сущности → символы. Нужно тексту блоков (ниже) и фиду Merchant Center
 * (utils/merchantFeed.ts).
 *
 * Сущности раскрывать обязательно, и не ради красоты. На сервере
 * `sanitizeHtml` отдаёт HTML как есть, а в браузере его пропускает DOMPurify,
 * который сериализует неразрывный пробел как `&nbsp;`. Без раскрытия сервер
 * рисовал «7 490 ₸», браузер после гидратации — буквально «7&nbsp;490 ₸», и
 * Vue ругался на расхождение гидратации. Так было с текстом связок «раздел +
 * бренд» (цены из formatPrice идут с неразрывным пробелом). Блоки рисуются
 * интерполяцией `{{ }}`, поэтому раскрытый `<` остаётся текстом.
 *
 * Один проход одной регуляркой: `&amp;lt;` даёт `&lt;`, а не `<`.
 */
export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? Number.parseInt(body.slice(2), 16)
        : Number.parseInt(body.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : entity
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? entity
  })
}

/** Текст блока: теги срезаются, сущности раскрываются. */
function blockText(inner: string): string {
  return decodeHtmlEntities(inner.replace(/<[^>]*>/g, '')).trim()
}

/*
 * Внутренние ссылки в текстах из базы (23 сентября 2026).
 *
 * До этого `blockText` срезал все теги, и `<a>` тоже: ни один текст раздела
 * из базы не мог сослаться на бренд или подраздел. А ссылка с текстом о
 * конструкторах на страницу LEGO — один из немногих сигналов, которыми
 * магазин сам может поднять страницу бренда: на неё с главной вела одна
 * ссылка, с `/catalog` — ни одной.
 *
 * Пропускаются только адреса самого сайта — начинаются с `/`, не с `//`,
 * без схем и кавычек. Всё остальное остаётся текстом. HTML не вставляется:
 * рендер рисует куски интерполяцией и `NuxtLink`.
 */
const LINK = /<a\s[^>]*?href\s*=\s*(["'])([^"']*)\1[^>]*>([\s\S]*?)<\/a>/gi

function safeHref(raw: string): string | null {
  const href = decodeHtmlEntities(raw.trim())
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(href) ? href : null
}

// Склеиваются только обычные пробелы и переносы: неразрывный пробел
// (`\s` в JavaScript его тоже ловит) держит цены вроде «7 490 ₸» одной строкой
function inlineText(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, '')).replace(/[ \t\r\n\f\v]+/g, ' ')
}

function inlineParts(inner: string): SEOInline[] | undefined {
  const parts: SEOInline[] = []
  let last = 0
  let hasLink = false
  for (const m of inner.matchAll(LINK)) {
    parts.push({ text: inlineText(inner.slice(last, m.index)) })
    const href = safeHref(m[2]!)
    const text = inlineText(m[3]!).trim()
    if (href && text) {
      parts.push({ text, href })
      hasLink = true
    }
    else {
      parts.push({ text: inlineText(m[3]!) })
    }
    last = m.index! + m[0].length
  }
  if (!hasLink)
    return undefined
  parts.push({ text: inlineText(inner.slice(last)) })

  // Соседние текстовые куски — в один, пустые — прочь, края — без пробелов
  const merged: SEOInline[] = []
  for (const part of parts) {
    const prev = merged[merged.length - 1]
    if (!part.href && prev && !prev.href)
      prev.text += part.text
    else
      merged.push({ ...part })
  }
  if (merged[0] && !merged[0].href)
    merged[0].text = merged[0].text.trimStart()
  const tail = merged[merged.length - 1]
  if (tail && !tail.href)
    tail.text = tail.text.trimEnd()
  return merged.filter(part => part.href || part.text)
}

/**
 * Парсит HTML в структурированные блоки для безопасного рендеринга.
 * Поддерживает data-icon на тегах h2/h3 и на дочерних span[data-icon].
 * SSR-совместимая версия (работает на сервере и клиенте).
 */
export function parseHTMLToBlocks(html: string): SEOBlock[] {
  if (!html?.trim())
    return []

  const blocks: SEOBlock[] = []

  // Нормализуем HTML - убираем лишние переносы между тегами
  const normalized = html.replace(/>\s+</g, '><')

  // Парсим каждый тип тега отдельно
  // `[\s\S]`, а не `.`: точка не берёт перенос строки, и абзац с переносом
  // внутри выпадал из страницы целиком (найдено 23 сентября 2026; на бою
  // таких текстов пока нет, но текст, набранный с переносами, пропал бы молча)
  const h2Regex = /<h2([^>]*)>([\s\S]*?)<\/h2>/gi
  const h3Regex = /<h3([^>]*)>([\s\S]*?)<\/h3>/gi
  const pRegex = /<p([^>]*)>([\s\S]*?)<\/p>/gi
  const ulRegex = /<ul([^>]*)>([\s\S]*?)<\/ul>/gi

  // Собираем все теги с их позициями для правильного порядка
  const allMatches: Array<{ index: number, block: SEOBlock }> = []

  // H2
  let match: RegExpExecArray | null
  while ((match = h2Regex.exec(normalized)) !== null) {
    const iconMatch = match[1].match(/data-icon=["']([^"']+)["']/)
    const text = blockText(match[2])
    if (text)
      allMatches.push({ index: match.index, block: { type: 'h2', text, icon: iconMatch?.[1] } })
  }

  // H3
  while ((match = h3Regex.exec(normalized)) !== null) {
    const iconMatch = match[1].match(/data-icon=["']([^"']+)["']/)
    const text = blockText(match[2])
    if (text)
      allMatches.push({ index: match.index, block: { type: 'h3', text, icon: iconMatch?.[1] } })
  }

  // P
  while ((match = pRegex.exec(normalized)) !== null) {
    const text = blockText(match[2])
    if (text) {
      const parts = inlineParts(match[2])
      allMatches.push({ index: match.index, block: { type: 'p', text, ...(parts && { parts }) } })
    }
  }

  // UL
  while ((match = ulRegex.exec(normalized)) !== null) {
    const items: SEOBlock['items'] = []
    const liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi
    let liMatch: RegExpExecArray | null

    while ((liMatch = liRegex.exec(match[2])) !== null) {
      const liIconMatch = liMatch[1].match(/data-icon=["']([^"']+)["']/)
      const text = blockText(liMatch[2])
      if (text) {
        const parts = inlineParts(liMatch[2])
        items.push({ text, icon: liIconMatch?.[1], ...(parts && { parts }) })
      }
    }

    if (items.length)
      allMatches.push({ index: match.index, block: { type: 'ul', items } })
  }

  // Сортируем по позиции в исходном HTML
  return allMatches.sort((a, b) => a.index - b.index).map(m => m.block)
}
