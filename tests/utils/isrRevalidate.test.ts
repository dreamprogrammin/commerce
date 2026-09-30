import { afterEach, describe, expect, it, vi } from 'vitest'
import { revalidateOnVercel, revalidationPaths } from '../../server/utils/isrRevalidate'

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
  it('карточка, раздел со всеми родителями, бренд и главная — каждый вместе с данными страницы', () => {
    expect(revalidationPaths({ productSlug: 'mashinka-x', categoryId: 'rc', brandSlug: 'mokatoys' }, categories)).toEqual([
      '/catalog/products/mashinka-x',
      '/catalog/products/mashinka-x/_payload.json',
      '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
      '/catalog/boys/mashinki/radioupravlyaemye-mashinki/_payload.json',
      '/catalog/boys/mashinki',
      '/catalog/boys/mashinki/_payload.json',
      '/catalog/boys',
      '/catalog/boys/_payload.json',
      '/brand/mokatoys',
      '/brand/mokatoys/_payload.json',
      '/',
      '/_payload.json',
    ])
  })

  it('раздел без href — по слагу; без бренда и раздела — карточка и главная', () => {
    expect(revalidationPaths({ productSlug: 'batareyka', categoryId: 'nohref' }, categories))
      .toContain('/catalog/accessories/_payload.json')
    expect(revalidationPaths({ productSlug: 'x' }, categories))
      .toEqual(['/catalog/products/x', '/catalog/products/x/_payload.json', '/', '/_payload.json'])
  })

  it('петля parent_id в данных не зацикливает', () => {
    const loop = [{ id: 'a', parent_id: 'b', slug: 'a', href: '/catalog/a' }, { id: 'b', parent_id: 'a', slug: 'b', href: '/catalog/b' }]
    expect(revalidationPaths({ productSlug: 'x', categoryId: 'a' }, loop).filter(p => p.startsWith('/catalog/') && !p.includes('products'))).toHaveLength(4)
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
