export type SEOBlockType = 'h2' | 'h3' | 'p' | 'ul'

export interface SEOBlock {
  type: SEOBlockType
  text?: string
  icon?: string
  items?: Array<{
    text: string
    icon?: string // иконка на каждом li если есть
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
 * Текст блока: теги срезаются, HTML-сущности раскрываются.
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
function blockText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
      if (body[0] === '#') {
        const code = body[1] === 'x' || body[1] === 'X'
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10)
        return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : entity
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? entity
    })
    .trim()
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
  const h2Regex = /<h2([^>]*)>(.*?)<\/h2>/gi
  const h3Regex = /<h3([^>]*)>(.*?)<\/h3>/gi
  const pRegex = /<p([^>]*)>(.*?)<\/p>/gi
  const ulRegex = /<ul([^>]*)>(.*?)<\/ul>/gi

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
    if (text)
      allMatches.push({ index: match.index, block: { type: 'p', text } })
  }

  // UL
  while ((match = ulRegex.exec(normalized)) !== null) {
    const items: SEOBlock['items'] = []
    const liRegex = /<li([^>]*)>(.*?)<\/li>/gi
    let liMatch: RegExpExecArray | null

    while ((liMatch = liRegex.exec(match[2])) !== null) {
      const liIconMatch = liMatch[1].match(/data-icon=["']([^"']+)["']/)
      const text = blockText(liMatch[2])
      if (text)
        items.push({ text, icon: liIconMatch?.[1] })
    }

    if (items.length)
      allMatches.push({ index: match.index, block: { type: 'ul', items } })
  }

  // Сортируем по позиции в исходном HTML
  return allMatches.sort((a, b) => a.index - b.index).map(m => m.block)
}
