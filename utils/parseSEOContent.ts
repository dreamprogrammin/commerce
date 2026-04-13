interface SEOBlock {
  type: 'h2' | 'h3' | 'p' | 'ul'
  text?: string
  icon?: string
  items?: string[]
}

/**
 * Парсит HTML в структурированные блоки для безопасного рендеринга
 */
export function parseHTMLToBlocks(html: string): SEOBlock[] {
  if (!html)
    return []

  const blocks: SEOBlock[] = []
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  doc.body.childNodes.forEach((node) => {
    if (node.nodeType !== Node.ELEMENT_NODE)
      return

    const el = node as HTMLElement
    const tagName = el.tagName.toLowerCase()

    // H2
    if (tagName === 'h2') {
      const iconEl = el.querySelector('.iconify, [data-icon]')
      const icon = iconEl?.getAttribute('data-icon') || undefined
      const text = el.textContent?.trim() || ''

      blocks.push({ type: 'h2', text, icon })
    }

    // H3
    else if (tagName === 'h3') {
      const iconEl = el.querySelector('.iconify, [data-icon]')
      const icon = iconEl?.getAttribute('data-icon') || undefined
      const text = el.textContent?.trim() || ''

      blocks.push({ type: 'h3', text, icon })
    }

    // P
    else if (tagName === 'p') {
      const text = el.textContent?.trim() || ''
      if (text)
        blocks.push({ type: 'p', text })
    }

    // UL
    else if (tagName === 'ul') {
      const items: string[] = []
      el.querySelectorAll('li').forEach((li) => {
        const text = li.textContent?.trim() || ''
        if (text)
          items.push(text)
      })
      if (items.length > 0)
        blocks.push({ type: 'ul', items })
    }
  })

  return blocks
}
