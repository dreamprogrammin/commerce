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
 * Работает только на клиенте (DOMParser).
 */
export function parseHTMLToBlocks(html: string): SEOBlock[] {
  if (!html?.trim()) return []

  // SSR guard — на сервере возвращаем пустой массив
  if (typeof window === 'undefined') return []

  const blocks: SEOBlock[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  const resolveIcon = (el: HTMLElement): string | undefined => {
    // Сначала data-icon на самом теге
    const own = el.getAttribute('data-icon')
    if (own) return own
    // Потом на дочернем .iconify или [data-icon]
    return el.querySelector('[data-icon]')?.getAttribute('data-icon') ?? undefined
  }

  const resolveText = (el: HTMLElement): string => {
    // Убираем текст иконок (aria-hidden span и т.п.) — берём только textContent
    return el.textContent?.trim().replace(/\s+/g, ' ') ?? ''
  }

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return

    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()

    if (tag === 'h2' || tag === 'h3') {
      const text = resolveText(el)
      if (!text) return
      blocks.push({ type: tag, text, icon: resolveIcon(el) })
      return
    }

    if (tag === 'p') {
      const text = resolveText(el)
      if (text) blocks.push({ type: 'p', text })
      return
    }

    if (tag === 'ul') {
      const items: SEOBlock['items'] = []
      el.querySelectorAll('li').forEach((li) => {
        const text = resolveText(li)
        if (text) items.push({ text, icon: resolveIcon(li) })
      })
      if (items.length) blocks.push({ type: 'ul', items })
    }
  })

  return blocks
}