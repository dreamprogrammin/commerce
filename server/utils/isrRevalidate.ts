/**
 * Сброс кеша ISR на Vercel по запросу — какие адреса и как.
 *
 * Зачем (30 сентября 2026). Карточка товара кешируется на час, раздел — на
 * 30 минут, главная — на 10. После смены цены в админке корзина и касса брали
 * новую цену из базы сразу, а карточка ещё до часа показывала старую. Хуже
 * того, HTML страницы и её данные (`_payload.json`) кешируются раздельно:
 * 30 сентября HTML карточки уже показывал 1 290 ₸, а данные — 1 190, и после
 * загрузки на странице стояла старая цена.
 *
 * Поэтому каждый адрес сбрасывается вместе со своим `_payload.json`.
 */

export interface RevalidateCategory {
  id: string
  parent_id: string | null
  slug: string | null
  href: string | null
}

export interface RevalidateTarget {
  productSlug?: string | null
  categoryId?: string | null
  brandSlug?: string | null
}

/** Адрес раздела — как его строит сайт: `href`, иначе `/catalog/<slug>`. */
function categoryPath(c: RevalidateCategory): string | null {
  if (c.href)
    return c.href
  return c.slug ? `/catalog/${c.slug}` : null
}

/**
 * Адреса, где виден товар: карточка, его раздел и все разделы выше (списки
 * показывают товары подразделов), страница бренда и главная (хиты). Каждый —
 * вместе с данными страницы.
 */
export function revalidationPaths(target: RevalidateTarget, categories: readonly RevalidateCategory[]): string[] {
  const pages: string[] = []
  if (target.productSlug)
    pages.push(`/catalog/products/${target.productSlug}`)

  const byId = new Map(categories.map(c => [c.id, c]))
  const seen = new Set<string>()
  let current = target.categoryId ? byId.get(target.categoryId) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    const path = categoryPath(current)
    if (path)
      pages.push(path)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }

  if (target.brandSlug)
    pages.push(`/brand/${target.brandSlug}`)
  pages.push('/')

  const unique = [...new Set(pages)]
  return unique.flatMap(p => [p, p === '/' ? '/_payload.json' : `${p}/_payload.json`])
}

/**
 * Просит Vercel пересобрать адреса. Ошибки не бросает: сброс — улучшение,
 * сохранение товара от него не зависит.
 */
export async function revalidateOnVercel(origin: string, token: string, paths: readonly string[]) {
  const results = await Promise.all(paths.map(async (path) => {
    try {
      const res = await fetch(`${origin}${path}`, {
        method: 'HEAD',
        headers: { 'x-prerender-revalidate': token },
        signal: AbortSignal.timeout(10_000),
      })
      return { path, status: res.status, cache: res.headers.get('x-vercel-cache') }
    }
    catch (error) {
      return { path, status: 0, cache: null, error: (error as Error).message }
    }
  }))
  return results
}
