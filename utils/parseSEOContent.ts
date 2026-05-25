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
    const text = match[2].replace(/<[^>]*>/g, '').trim()
    if (text)
      allMatches.push({ index: match.index, block: { type: 'h2', text, icon: iconMatch?.[1] } })
  }

  // H3
  while ((match = h3Regex.exec(normalized)) !== null) {
    const iconMatch = match[1].match(/data-icon=["']([^"']+)["']/)
    const text = match[2].replace(/<[^>]*>/g, '').trim()
    if (text)
      allMatches.push({ index: match.index, block: { type: 'h3', text, icon: iconMatch?.[1] } })
  }

  // P
  while ((match = pRegex.exec(normalized)) !== null) {
    const text = match[2].replace(/<[^>]*>/g, '').trim()
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
      const text = liMatch[2].replace(/<[^>]*>/g, '').trim()
      if (text)
        items.push({ text, icon: liIconMatch?.[1] })
    }

    if (items.length)
      allMatches.push({ index: match.index, block: { type: 'ul', items } })
  }

  // Сортируем по позиции в исходном HTML
  return allMatches.sort((a, b) => a.index - b.index).map(m => m.block)
}
