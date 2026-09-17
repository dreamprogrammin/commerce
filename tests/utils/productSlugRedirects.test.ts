import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRODUCT_SLUG_REDIRECTS, productSlugRedirectFor } from '@/constants/productSlugRedirects'

interface VercelRedirect {
  source: string
  destination: string
  permanent?: boolean
  has?: unknown
}

const vercel = JSON.parse(
  readFileSync(resolve(__dirname, '../../vercel.json'), 'utf8'),
) as { redirects: VercelRedirect[] }

describe('productSlugRedirectFor', () => {
  it('старый адрес карточки ведёт на живую страницу', () => {
    expect(
      productSlugRedirectFor('/catalog/products/akkordeon-detskiy-xx2028-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let'),
    ).toBe('/catalog/products/akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let')
  })

  it('обычная несуществующая карточка остаётся 404', () => {
    // Иначе редирект превратился бы в мягкий 404 на весь раздел.
    expect(productSlugRedirectFor('/catalog/products/takogo-tovara-net-12345')).toBeNull()
  })
})

describe('карта и vercel.json не разъезжаются', () => {
  /*
   * На бою редирект делает платформа, а не обработчик Nitro: правило
   * `'/catalog/products/**'` в routeRules перехватывает запрос раньше. Значит
   * список обязан быть в двух местах сразу — и именно такие пары на этом
   * проекте уже расходились (см. комментарий в brand-query-redirect.ts).
   */
  it('каждая строка карты есть в vercel.json как постоянный редирект', () => {
    for (const r of PRODUCT_SLUG_REDIRECTS) {
      const rule = vercel.redirects.find(x => x.source === r.from)
      expect(rule, `нет правила для ${r.from}`).toBeDefined()
      expect(rule!.destination).toBe(r.to)
      expect(rule!.permanent).toBe(true)
    }
  })

  it('в vercel.json нет редиректов карточек помимо карты', () => {
    const inJson = vercel.redirects
      .filter(x => x.source.startsWith('/catalog/products/') && !x.has)
      .map(x => x.source)
      .sort()
    expect(inJson).toEqual(PRODUCT_SLUG_REDIRECTS.map(r => r.from).sort())
  })
})

describe('целостность карты', () => {
  it('цепочек редиректов нет: ни одна цель не является чужим старым адресом', () => {
    const froms = new Set(PRODUCT_SLUG_REDIRECTS.map(r => r.from))
    for (const r of PRODUCT_SLUG_REDIRECTS)
      expect(froms.has(r.to), `${r.from} ведёт на другой редирект`).toBe(false)
  })

  it('один старый адрес встречается один раз', () => {
    const froms = PRODUCT_SLUG_REDIRECTS.map(r => r.from)
    expect(new Set(froms).size).toBe(froms.length)
  })

  it('цели внутренние и не ведут сами на себя', () => {
    for (const r of PRODUCT_SLUG_REDIRECTS) {
      expect(r.to.startsWith('/'), `${r.to} должен быть внутренним путём`).toBe(true)
      expect(r.to).not.toBe(r.from)
    }
  })
})
