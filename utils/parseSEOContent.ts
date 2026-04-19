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
  if (!html?.trim()) return []

  const blocks: SEOBlock[] = []

  // SSR-совместимый парсинг через регулярные выражения
  const tagRegex = /<(h2|h3|p|ul)([^>]*)>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null

  while ((match = tagRegex.exec(html)) !== null) {
    const [, tag, attrs, content] = match
    const tagLower = tag.toLowerCase() as SEOBlockType

    // Извлекаем data-icon из атрибутов
    const iconMatch = attrs.match(/data-icon=["']([^"']+)["']/)
    const icon = iconMatch ? iconMatch[1] : undefined

    if (tagLower === 'h2' || tagLower === 'h3') {
      const text = content.replace(/<[^>]*>/g, '').trim()
      if (text) blocks.push({ type: tagLower, text, icon })
    }
    else if (tagLower === 'p') {
      const text = content.replace(/<[^>]*>/g, '').trim()
      if (text) blocks.push({ type: 'p', text })
    }
    else if (tagLower === 'ul') {
      const items: SEOBlock['items'] = []
      const liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi
      let liMatch: RegExpExecArray | null

      while ((liMatch = liRegex.exec(content)) !== null) {
        const [, liAttrs, liContent] = liMatch
        const liIconMatch = liAttrs.match(/data-icon=["']([^"']+)["']/)
        const liIcon = liIconMatch ? liIconMatch[1] : undefined
        const text = liContent.replace(/<[^>]*>/g, '').trim()
        if (text) items.push({ text, icon: liIcon })
      }

      if (items.length) blocks.push({ type: 'ul', items })
    }
  }

  return blocks
}