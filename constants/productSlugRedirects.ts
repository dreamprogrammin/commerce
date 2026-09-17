/**
 * Адреса карточек, которые сменились, — старый путь ведёт на живую страницу.
 *
 * Зачем это вообще нужно. Карточка теряет свой адрес двумя способами, и оба
 * штатные:
 *  1. Правка названия в админке перегенерирует slug — `ProductForm.vue` следит
 *     за `formData.name` и подставляет `slugify(newName)`, пока поле slug не
 *     тронули руками.
 *  2. Товар удаляется жёстким DELETE (`adminProductsStore.deleteProduct`), а на
 *     его место заводится новая карточка под новым артикулом.
 * Истории адресов нигде нет, так что старый URL после этого просто отдаёт 404.
 *
 * Чем это обошлось. Search Console за 90 дней, замер 17 сентября 2026: пять
 * адресов карточек продолжают получать показы и все пять отдают 404. Крупнейший
 * из них — 165 показов на средней позиции 4.8 по запросу «xx2028»: это самый
 * показываемый запрос сайта целиком. Товар при этом есть в наличии, 42 штуки, —
 * в июле карточку пересоздали под артикулом HiH02.
 *
 * Как выбирались цели. Сначала ищется та же вещь (совпал артикул в названии или
 * описании) — тогда ведём прямо на неё. Если товара больше нет, ведём на раздел,
 * где лежит ближайшее, а не на главную: с главной человек уходит.
 *
 * ВАЖНО: боевой редирект делает не этот файл, а `vercel.json` — на Vercel
 * правило `'/catalog/products/**'` в `routeRules` заворачивает запрос в
 * функцию раньше, чем до него доберётся серверный обработчик Nitro (так уже
 * было с бренд-редиректом, см. `server/middleware/brand-query-redirect.ts`).
 * Здесь карта — источник правды для локальной сборки и для теста, который
 * сверяет её с `vercel.json`, чтобы два места не разъехались.
 */
export interface ProductSlugRedirect {
  /** Старый путь целиком, как он лежит в индексе. */
  from: string
  /** Куда ведём — живая карточка или раздел с заменой. */
  to: string
  /** Показов за 90 дней на замере 17 сентября 2026 — цена строки. */
  impressions: number
  /** Почему именно эта цель. */
  why: string
}

export const PRODUCT_SLUG_REDIRECTS: readonly ProductSlugRedirect[] = [
  {
    from: '/catalog/products/akkordeon-detskiy-xx2028-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let',
    to: '/catalog/products/akkordeon-detskiy-hih02-plastik-zvukovye-effekty-yarkiy-dizayn-dlya-detey-ot-3-let',
    impressions: 165,
    why: 'тот же аккордеон под новым артикулом, XX2028 остался в описании; в наличии 42 шт',
  },
  {
    from: '/catalog/products/lego-marvel-76287-zheleznyy-chelovek-s-motociklom-i-halk-pervyy-konstruktor-dlya-detey-ot-4-let',
    to: '/catalog/products/konstruktor-lego-marvel-76287-zheleznyy-chelovek-na-motocikle-protiv-halka-s-razrushaemym-domom',
    impressions: 3,
    why: 'тот же набор 76287, карточку переписали под другое название',
  },
  {
    from: '/catalog/products/batteries-aa-4pcs',
    to: '/catalog/products/batareyki-soni-palchikovye-solevye-tip-aa-15v-4-sht-v-upakovke-dlya-rc-igrushek',
    impressions: 2,
    why: 'тот же товар: пальчиковые AA, 4 штуки в упаковке',
  },
  {
    from: '/catalog/products/batteries-aaa-2pcs',
    to: '/catalog/accessories/batteries',
    impressions: 8,
    why: 'мизинчиковых AAA сейчас нет ни одной — ведём в раздел батареек, там AA',
  },
  {
    from: '/catalog/products/radioupravlyaemaya-mashina-vnedorozhnik-2172-masshtab-1-16-so-zvukom-i-svetom-off-road-s-usb-zaryadkoy',
    to: '/catalog/boys/mashinki/radioupravlyaemye-mashinki',
    impressions: 2,
    why: 'артикула 2172 в базе нет; в разделе есть другие радиоуправляемые внедорожники',
  },
]

/** Путь, куда вести старый адрес, или `null`, если это обычная несуществующая карточка. */
export function productSlugRedirectFor(pathname: string): string | null {
  return PRODUCT_SLUG_REDIRECTS.find(r => r.from === pathname)?.to ?? null
}
