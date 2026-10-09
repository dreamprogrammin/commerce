import { afterEach, describe, expect, it, vi } from 'vitest'
import { pathsForRequest, revalidateOnVercel, revalidationPaths, sanitizePaths, uuidList } from '../../server/utils/isrRevalidate'

/**
 * Сброс кеша ISR после сохранения товара (30 сентября 2026).
 *
 * После смены цены корзина и касса брали новую цену из базы сразу, а карточка
 * ещё до часа показывала старую; HTML и данные страницы (`_payload.json`)
 * кешируются раздельно и тоже расходились.
 */

const categories = [
  { id: 'boys', parent_id: null, slug: 'boys', href: '/catalog/boys' },
  { id: 'mashinki', parent_id: 'boys', slug: 'mashinki', href: '/catalog/boys/mashinki' },
  { id: 'rc', parent_id: 'mashinki', slug: 'radioupravlyaemye-mashinki', href: '/catalog/boys/mashinki/radioupravlyaemye-mashinki' },
  { id: 'nohref', parent_id: null, slug: 'accessories', href: null },
]

describe('revalidationPaths', () => {
  it('карточка, раздел со всеми родителями, связки «раздел + бренд», бренд и главная — каждый вместе с данными страницы', () => {
    // Связки — с 9 октября 2026 (кеш суточный): на некорневых разделах цепочки
    expect(revalidationPaths({ productSlug: 'mashinka-x', categoryId: 'rc', brandSlug: 'mokatoys' }, categories)).toEqual([
      '/catalog/products/mashinka-x',
      '/catalog/products/mashinka-x/_payload.json',
      '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
      '/catalog/boys/mashinki/radioupravlyaemye-mashinki/_payload.json',
      '/catalog/boys/mashinki/radioupravlyaemye-mashinki/brand/mokatoys',
      '/catalog/boys/mashinki/radioupravlyaemye-mashinki/brand/mokatoys/_payload.json',
      '/catalog/boys/mashinki',
      '/catalog/boys/mashinki/_payload.json',
      '/catalog/boys/mashinki/brand/mokatoys',
      '/catalog/boys/mashinki/brand/mokatoys/_payload.json',
      '/catalog/boys',
      '/catalog/boys/_payload.json',
      '/brand/mokatoys',
      '/brand/mokatoys/_payload.json',
      '/catalog/new',
      '/catalog/new/_payload.json',
      '/catalog/promotions',
      '/catalog/promotions/_payload.json',
      '/',
      '/_payload.json',
    ])
  })

  it('серия товара — своя страница бренда', () => {
    expect(revalidationPaths({ productSlug: 'x', brandSlug: 'lego', lineSlug: 'lego-city' }, categories))
      .toContain('/brand/lego/lego-city/_payload.json')
  })

  it('раздел без href — по слагу; без бренда и раздела — карточка и главная', () => {
    expect(revalidationPaths({ productSlug: 'batareyka', categoryId: 'nohref' }, categories))
      .toContain('/catalog/accessories/_payload.json')
    expect(revalidationPaths({ productSlug: 'x' }, categories))
      .toEqual(['/catalog/products/x', '/catalog/products/x/_payload.json', '/catalog/new', '/catalog/new/_payload.json', '/catalog/promotions', '/catalog/promotions/_payload.json', '/', '/_payload.json'])
  })

  it('петля parent_id в данных не зацикливает', () => {
    const loop = [{ id: 'a', parent_id: 'b', slug: 'a', href: '/catalog/a' }, { id: 'b', parent_id: 'a', slug: 'b', href: '/catalog/b' }]
    expect(revalidationPaths({ productSlug: 'x', categoryId: 'a' }, loop).filter(p => /^\/catalog\/[ab]\b/.test(p))).toHaveLength(4)
  })
})

describe('revalidateOnVercel', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('шлёт HEAD с токеном на каждый адрес и не бросает на сбое сети', async () => {
    const calls: { url: string, init: RequestInit }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      if (url.endsWith('/boom'))
        throw new Error('network')
      return new Response(null, { status: 200, headers: { 'x-vercel-cache': 'REVALIDATED' } })
    }))
    const results = await revalidateOnVercel('https://uhti.kz', 'secret', ['/', '/boom'])
    expect(calls.map(c => c.url)).toEqual(['https://uhti.kz/', 'https://uhti.kz/boom'])
    expect(calls[0]!.init.method).toBe('HEAD')
    expect((calls[0]!.init.headers as Record<string, string>)['x-prerender-revalidate']).toBe('secret')
    expect(results[0]).toMatchObject({ status: 200, cache: 'REVALIDATED' })
    expect(results[1]).toMatchObject({ status: 0, error: 'network' })
  })
})

/*
 * 9 октября 2026: кеш суточный — сбрасывается всё, где видна правка.
 */
const data = {
  categories,
  products: [
    { id: 'p1', slug: 'mashinka-x', category_id: 'rc', brand_id: 'b-moka', product_line_id: null },
    { id: 'p2', slug: 'lego-60430', category_id: null, brand_id: 'b-lego', product_line_id: 'l-city' },
  ],
  brands: [{ id: 'b-moka', slug: 'mokatoys' }, { id: 'b-lego', slug: 'lego' }],
  lines: [{ id: 'l-city', slug: 'lego-city', brand_id: 'b-lego' }, { id: 'l-dc', slug: 'lego-dc', brand_id: 'b-lego' }],
}

describe('pathsForRequest', () => {
  it('товары: их страницы, без повторов; главная одна', () => {
    const paths = pathsForRequest({ productIds: ['p1', 'p2'] }, data)
    expect(paths).toContain('/catalog/products/mashinka-x')
    expect(paths).toContain('/brand/lego/lego-city')
    expect(paths.filter(p => p === '/')).toHaveLength(1)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('бренд — страница бренда и все его серии; серия — она и её бренд', () => {
    expect(pathsForRequest({ brandIds: ['b-lego'] }, data)).toEqual([
      '/brand/lego',
      '/brand/lego/_payload.json',
      '/brand/lego/lego-city',
      '/brand/lego/lego-city/_payload.json',
      '/brand/lego/lego-dc',
      '/brand/lego/lego-dc/_payload.json',
    ])
    expect(pathsForRequest({ lineIds: ['l-dc'] }, data)).toContain('/brand/lego/_payload.json')
  })

  it('раздел — он и разделы выше', () => {
    expect(pathsForRequest({ categoryIds: ['mashinki'] }, data)).toEqual([
      '/catalog/boys/mashinki',
      '/catalog/boys/mashinki/_payload.json',
      '/catalog/boys',
      '/catalog/boys/_payload.json',
    ])
  })

  it('дерево разделов — все разделы, бренды, серии, главная, /catalog и /brands', () => {
    const paths = pathsForRequest({ scope: 'catalog' }, data)
    for (const p of ['/catalog/accessories', '/brand/mokatoys', '/brand/lego/lego-dc', '/', '/catalog', '/catalog/new', '/catalog/promotions', '/brands'])
      expect(paths).toContain(p)
  })

  it('акция — страницы её товаров (их подставляет загрузчик), запрос не меняется', () => {
    const req = { campaignIds: ['c1'] }
    expect(pathsForRequest(req, { ...data, campaignProductIds: ['p1'] })).toContain('/catalog/products/mashinka-x')
    expect(req).toEqual({ campaignIds: ['c1'] })
  })

  it('готовые адреса — только страницы сайта', () => {
    expect(pathsForRequest({ paths: ['/', 'https://evil.example/x', '//evil.example', '/api/admin/x', '/brand/../admin', '/brand/old-brand'] }, data))
      .toEqual(['/', '/_payload.json', '/brand/old-brand', '/brand/old-brand/_payload.json'])
  })
})

describe('sanitizePaths и uuidList', () => {
  it('служебные пути и мусор отбрасываются', () => {
    expect(sanitizePaths(['/_nuxt/x.js', '/admin', '/catalog?x=1', 42, '/catalog/boys'])).toEqual(['/catalog/boys'])
  })
  it('в фильтры уходят только UUID и не больше предела', () => {
    const id = '2df67fed-6f86-4121-bb4d-bae3d049cd38'
    expect(uuidList([id, 'x); drop table', 5])).toEqual([id])
    expect(uuidList(Array.from({ length: 5 }, () => id), 3)).toHaveLength(3)
    expect(uuidList('not-an-array')).toEqual([])
  })
})

describe('revalidateOnVercel: не больше заданного числа запросов разом', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('при 20 адресах одновременно в работе не больше 6', async () => {
    let active = 0
    let peak = 0
    vi.stubGlobal('fetch', vi.fn(async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise(r => setTimeout(r, 5))
      active--
      return new Response(null, { status: 200 })
    }))
    const paths = Array.from({ length: 20 }, (_, i) => `/p${i}`)
    const results = await revalidateOnVercel('https://uhti.kz', 't', paths)
    expect(peak).toBeLessThanOrEqual(6)
    expect(results.map(r => r.path)).toEqual(paths)
  })
})
