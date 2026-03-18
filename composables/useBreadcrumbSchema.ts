interface BreadcrumbItem {
  name: string
  path?: string
}

/**
 * Генерирует BreadcrumbList JSON-LD schema для Google.
 * Автоматически добавляет "Главная" первым элементом.
 *
 * @example
 * // Статические крошки
 * useBreadcrumbSchema([
 *   { name: 'Каталог', path: '/catalog' },
 *   { name: 'Новинки' },
 * ])
 *
 * // Реактивные крошки (computed/ref)
 * useBreadcrumbSchema(computed(() => [
 *   { name: 'Бренды', path: '/brand/all' },
 *   { name: brand.value?.name || '' },
 * ]))
 */
export function useBreadcrumbSchema(items: MaybeRef<BreadcrumbItem[]>) {
  const siteUrl = 'https://uhti.kz'

  useHead(() => {
    const crumbs = unref(items)
    if (!crumbs || crumbs.length === 0) return {}

    const allItems: BreadcrumbItem[] = [
      { name: 'Главная', path: '/' },
      ...crumbs,
    ]

    return {
      script: [
        {
          type: 'application/ld+json',
          innerHTML: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            'itemListElement': allItems.map((crumb, index) => {
              const entry: Record<string, unknown> = {
                '@type': 'ListItem',
                'position': index + 1,
                'name': crumb.name,
              }
              if (crumb.path) {
                entry.item = `${siteUrl}${crumb.path}`
              }
              return entry
            }),
          }),
        },
      ],
    }
  })
}
