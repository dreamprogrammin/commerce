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
 *
 * 9 октября 2026 — шире. Ради лимита трафика Supabase кеш страниц стал
 * суточным, и «подождать час» больше не годится: сбрасываются все страницы,
 * где видна правка, — связки «раздел + бренд», серии, правки брендов,
 * разделов, акций, баннеров, а после заказа — карточки проданных товаров
 * (остаток). Что именно сбросить, говорит `RevalidateRequest`.
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
  /** Слаг серии бренда — `/brand/<бренд>/<серия>` */
  lineSlug?: string | null
}

/** Адрес раздела — как его строит сайт: `href`, иначе `/catalog/<slug>`. */
function categoryPath(c: RevalidateCategory): string | null {
  if (c.href)
    return c.href
  return c.slug ? `/catalog/${c.slug}` : null
}

/** Раздел и все разделы выше. `seen` — защита от петли `parent_id` в данных. */
function categoryChain(categoryId: string | null | undefined, byId: ReadonlyMap<string, RevalidateCategory>): RevalidateCategory[] {
  const chain: RevalidateCategory[] = []
  const seen = new Set<string>()
  let current = categoryId ? byId.get(categoryId) : undefined
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    chain.push(current)
    current = current.parent_id ? byId.get(current.parent_id) : undefined
  }
  return chain
}

/** К каждой странице — её данные (`_payload.json`); повторы убираются. */
export function withPayloads(pages: readonly string[]): string[] {
  const unique = [...new Set(pages)]
  return unique.flatMap(p => [p, p === '/' ? '/_payload.json' : `${p}/_payload.json`])
}

/**
 * Страницы, где виден товар: карточка, его раздел и все разделы выше (списки
 * показывают товары подразделов), связки «раздел + бренд» на этих разделах
 * (кроме корневых), страница бренда и серии, главная (хиты, новинки).
 */
export function productPages(target: RevalidateTarget, categories: readonly RevalidateCategory[]): string[] {
  const byId = new Map(categories.map(c => [c.id, c]))
  const pages: string[] = []
  if (target.productSlug)
    pages.push(`/catalog/products/${target.productSlug}`)
  for (const c of categoryChain(target.categoryId, byId)) {
    const path = categoryPath(c)
    if (!path)
      continue
    pages.push(path)
    if (target.brandSlug && c.parent_id)
      pages.push(`${path}/brand/${target.brandSlug}`)
  }
  if (target.brandSlug) {
    pages.push(`/brand/${target.brandSlug}`)
    if (target.lineSlug)
      pages.push(`/brand/${target.brandSlug}/${target.lineSlug}`)
  }
  pages.push('/')
  return pages
}

/** Прежний вызов (30 сентября): страницы товара вместе с их данными. */
export function revalidationPaths(target: RevalidateTarget, categories: readonly RevalidateCategory[]): string[] {
  return withPayloads(productPages(target, categories))
}

/**
 * Явные адреса — только страницы сайта. Служебное (`/api`, `/admin`,
 * `/_nuxt`) и всё, что не похоже на путь, отбрасывается: адрес уходит в
 * запрос с токеном, и чужой хост или мусор туда попасть не должны.
 */
export function sanitizePaths(paths: readonly unknown[] | null | undefined): string[] {
  return (paths ?? []).filter((p): p is string =>
    typeof p === 'string'
    && p.length <= 300
    && /^\/[\w\-./%]*$/.test(p)
    && !p.startsWith('//')
    && !p.includes('..')
    && !/^\/(?:api|admin|_nuxt|__nuxt)(?:\/|$)/.test(p),
  )
}

export interface RevalidateRequest {
  productIds?: string[]
  categoryIds?: string[]
  brandIds?: string[]
  lineIds?: string[]
  campaignIds?: string[]
  paths?: string[]
  /** Правка дерева разделов: все разделы, бренды, серии, главная, `/catalog`, `/brands` */
  scope?: 'catalog'
}

export interface RevalidateData {
  categories: RevalidateCategory[]
  products: { id: string, slug: string | null, category_id: string | null, brand_id: string | null, product_line_id: string | null }[]
  brands: { id: string, slug: string | null }[]
  lines: { id: string, slug: string | null, brand_id: string | null }[]
  /** Товары акций из `campaignIds` — их подставляет загрузчик */
  campaignProductIds?: string[]
}

/** Все адреса по запросу — чистая функция, данные уже загружены. */
export function pathsForRequest(req: RevalidateRequest, data: RevalidateData): string[] {
  const byId = new Map(data.categories.map(c => [c.id, c]))
  const brandSlug = new Map(data.brands.map(b => [b.id, b.slug]))
  const lineById = new Map(data.lines.map(l => [l.id, l]))
  const pages: string[] = []

  const productIds = new Set([...(req.productIds ?? []), ...(data.campaignProductIds ?? [])])
  for (const p of data.products) {
    if (!productIds.has(p.id) || !p.slug)
      continue
    pages.push(...productPages({
      productSlug: p.slug,
      categoryId: p.category_id,
      brandSlug: p.brand_id ? brandSlug.get(p.brand_id) : null,
      lineSlug: p.product_line_id ? lineById.get(p.product_line_id)?.slug : null,
    }, data.categories))
  }

  for (const id of req.categoryIds ?? []) {
    for (const c of categoryChain(id, byId)) {
      const path = categoryPath(c)
      if (path)
        pages.push(path)
    }
  }

  const brandIds = new Set(req.brandIds ?? [])
  for (const l of req.lineIds ?? []) {
    const line = lineById.get(l)
    if (line?.brand_id)
      brandIds.add(line.brand_id)
  }
  for (const id of brandIds) {
    const slug = brandSlug.get(id)
    if (!slug)
      continue
    pages.push(`/brand/${slug}`)
    for (const l of data.lines) {
      if (l.brand_id === id && l.slug)
        pages.push(`/brand/${slug}/${l.slug}`)
    }
  }

  if (req.scope === 'catalog') {
    for (const c of data.categories) {
      const path = categoryPath(c)
      if (path)
        pages.push(path)
    }
    for (const b of data.brands) {
      if (b.slug)
        pages.push(`/brand/${b.slug}`)
    }
    for (const l of data.lines) {
      const slug = l.brand_id ? brandSlug.get(l.brand_id) : null
      if (slug && l.slug)
        pages.push(`/brand/${slug}/${l.slug}`)
    }
    pages.push('/', '/catalog', '/brands')
  }

  pages.push(...sanitizePaths(req.paths))
  return withPayloads(pages)
}

type Db = any

/** Загрузить из базы ровно то, что нужно для `pathsForRequest`. */
export async function loadRevalidateData(db: Db, req: RevalidateRequest): Promise<RevalidateData> {
  let campaignProductIds: string[] = []
  if (req.campaignIds?.length) {
    const { data } = await db.from('promo_campaign_products').select('product_id').in('campaign_id', req.campaignIds)
    campaignProductIds = ((data ?? []) as { product_id: string }[]).map(r => r.product_id)
  }
  const productIds = [...new Set([...(req.productIds ?? []), ...campaignProductIds])]
  const all = req.scope === 'catalog'

  const [{ data: categories }, { data: products }] = await Promise.all([
    db.from('categories').select('id, parent_id, slug, href'),
    productIds.length
      ? db.from('products').select('id, slug, category_id, brand_id, product_line_id').in('id', productIds)
      : Promise.resolve({ data: [] }),
  ])

  const brandIds = new Set<string>(req.brandIds ?? [])
  const lineIds = new Set<string>(req.lineIds ?? [])
  for (const p of (products ?? []) as RevalidateData['products']) {
    if (p.brand_id)
      brandIds.add(p.brand_id)
    if (p.product_line_id)
      lineIds.add(p.product_line_id)
  }

  const [{ data: brands }, { data: lines }] = await Promise.all([
    all
      ? db.from('brands').select('id, slug')
      : brandIds.size ? db.from('brands').select('id, slug').in('id', [...brandIds]) : Promise.resolve({ data: [] }),
    all
      ? db.from('product_lines').select('id, slug, brand_id')
      : (lineIds.size || (req.brandIds ?? []).length)
          ? db.from('product_lines').select('id, slug, brand_id').or([
              lineIds.size ? `id.in.(${[...lineIds].join(',')})` : '',
              (req.brandIds ?? []).length ? `brand_id.in.(${(req.brandIds ?? []).join(',')})` : '',
            ].filter(Boolean).join(','))
          : Promise.resolve({ data: [] }),
  ])

  // Бренды серий из запроса — тоже нужны слаги
  const missing = ((lines ?? []) as RevalidateData['lines'])
    .map(l => l.brand_id)
    .filter((id): id is string => !!id && !((brands ?? []) as RevalidateData['brands']).some(b => b.id === id))
  const { data: extraBrands } = missing.length
    ? await db.from('brands').select('id, slug').in('id', [...new Set(missing)])
    : { data: [] }

  return {
    categories: (categories ?? []) as RevalidateCategory[],
    products: (products ?? []) as RevalidateData['products'],
    brands: [...((brands ?? []) as RevalidateData['brands']), ...((extraBrands ?? []) as RevalidateData['brands'])],
    lines: (lines ?? []) as RevalidateData['lines'],
    campaignProductIds,
  }
}

/** UUID из тела запроса — только они уходят в фильтры `.in(...)`. */
export function uuidList(value: unknown, max = 200): string[] {
  if (!Array.isArray(value))
    return []
  return value.filter((v): v is string => typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v)).slice(0, max)
}

/**
 * Просит Vercel пересобрать адреса — не больше `concurrency` одновременно.
 * Ошибки не бросает: сброс — улучшение, сохранение от него не зависит.
 */
export async function revalidateOnVercel(origin: string, token: string, paths: readonly string[], concurrency = 6) {
  const results: { path: string, status: number, cache: string | null, error?: string }[] = []
  const queue = [...paths]
  async function worker() {
    while (queue.length) {
      const path = queue.shift()!
      try {
        const res = await fetch(`${origin}${path}`, {
          method: 'HEAD',
          headers: { 'x-prerender-revalidate': token },
          signal: AbortSignal.timeout(15_000),
        })
        results.push({ path, status: res.status, cache: res.headers.get('x-vercel-cache') })
      }
      catch (error) {
        results.push({ path, status: 0, cache: null, error: (error as Error).message })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, paths.length) }, worker))
  // В порядке исходного списка — так проще читать ответ
  return paths.map(p => results.find(r => r.path === p)!)
}
