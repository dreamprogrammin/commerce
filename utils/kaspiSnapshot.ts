/**
 * Цифры Kaspi у тем спроса и товаров поставщиков (20 ноября 2026,
 * миграция 20261120120000). Владелец приносит их сам — кнопкой в браузере со
 * страницы Kaspi, которую он открыл, или скриншотом; сервер на kaspi.kz не
 * ходит.
 *
 * Кнопка (закладка) только собирает сырьё со страницы — адрес, заголовок,
 * JSON-LD и видимый текст — и передаёт его странице админки «Kaspi» в части
 * адреса после «#» (на сервер она не уходит). Разбирает сырьё этот модуль:
 * поправить разбор можно выкаткой сайта, переставлять закладку не придётся.
 */

export type KaspiSource = 'page' | 'screenshot' | 'manual'

export interface KaspiFields {
  title: string
  price: number | null
  reviews: number | null
  rating: number | null
  sellers: number | null
}

export interface KaspiPageRaw {
  url: string
  title: string
  /** Тексты script[type="application/ld+json"] */
  ld: string[]
  /** document.body.innerText, обрезанный закладкой */
  text: string
  /** Карточки товаров со страницы поиска (с 20.11.2026; у старой закладки — нет) */
  cards?: KaspiCardRaw[]
}

/** Карточка товара в выдаче: ссылка, название, текст карточки, картинка */
export interface KaspiCardRaw {
  href: string
  title: string
  text: string
  img: string
}

/** Товар выдачи Kaspi после разбора */
export interface KaspiCandidate extends KaspiFields {
  url: string
  /** Картинка товара на CDN Kaspi; null — не нашлась или чужой адрес */
  image: string | null
  /** Текст карточки — в нём ищется артикул */
  text: string
}

/** Карточек с одной страницы — не больше */
export const KASPI_CARDS_LIMIT = 60

export interface KaspiParsed extends KaspiFields {
  url: string | null
  /** Поля, которые нашлись на странице — остальные владелец добирает руками */
  found: (keyof KaspiFields)[]
}

export interface KaspiSnapshot extends KaspiFields {
  id: number
  topicId: string | null
  offerId: string | null
  offerItem: number | null
  url: string | null
  source: KaspiSource
  takenAt: string
}

/** Сводка по последнему замеру: что показать на карточке */
export interface KaspiSummary {
  last: KaspiSnapshot
  /** Отзывов добавилось с самого раннего замера того же товара; null — сравнить не с чем */
  reviewsGrowth: number | null
  /** За сколько дней этот прирост */
  growthDays: number | null
  count: number
}

/** Скрипт закладки: столько текста страницы хватает на цену, отзывы и продавцов */
export const KASPI_TEXT_LIMIT = 20_000
/** Имя вкладки «Kaspi» в админке: закладка открывает цифры в ней же, а не в новой */
export const KASPI_WINDOW = 'uhti-kaspi'

const PRODUCT_URL = /^https:\/\/kaspi\.kz\/[^\s#?]*/

/** Адрес товара без меток и города: по нему сравниваются замеры одного товара */
export function normalizeKaspiUrl(url: unknown): string | null {
  if (typeof url !== 'string')
    return null
  const m = PRODUCT_URL.exec(url.trim())
  if (!m)
    return null
  return m[0].replace(/\/+$/, '/')
}

export function kaspiSearchUrl(name: string): string {
  return `https://kaspi.kz/shop/search/?text=${encodeURIComponent(name.trim())}`
}

/** «1 234», «1 234» (неразрывный пробел), «1234» → 1234 */
function int(s: string | undefined | null): number | null {
  if (s == null)
    return null
  const n = Number(String(s).replace(/\s/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null
}

function num(v: unknown): number | null {
  if (typeof v === 'number')
    return Number.isFinite(v) && v >= 0 ? v : null
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  return null
}

function rating(v: number | null): number | null {
  return v != null && v <= 5 ? Math.round(v * 10) / 10 : null
}

/** Product из JSON-LD — в том числе внутри @graph и массивов */
function ldProduct(ld: string[]): Record<string, any> | null {
  const queue: unknown[] = []
  for (const s of ld) {
    try {
      queue.push(JSON.parse(s))
    }
    catch {}
  }
  while (queue.length) {
    const x = queue.shift()
    if (Array.isArray(x)) {
      queue.push(...x)
      continue
    }
    if (!x || typeof x !== 'object')
      continue
    const o = x as Record<string, any>
    const type = ([] as unknown[]).concat(o['@type'] ?? [])
    if (type.includes('Product'))
      return o
    if (o['@graph'])
      queue.push(o['@graph'])
  }
  return null
}

/** Число с разрядами через пробел; без переноса строки — иначе склеиваются соседние числа */
const NUM = String.raw`(?<!\d)(?:\d{1,3}(?:[ \u00A0\u202F]\d{3})+|\d+)`

/** Цифры по видимому тексту страницы или карточки */
function numbersFromText(text: string): Omit<KaspiFields, 'title'> {
  // Первая цена, за которой не идёт «× 12» — то рассрочка
  const price = int(new RegExp(`(${NUM})\\s*₸(?!\\s*[x×х]\\s*\\d)`).exec(text)?.[1])
  const reviews = int(new RegExp(`(${NUM})\\s*отзыв`, 'i').exec(text)?.[1])
  const rate = rating(num(/\b([0-5][.,]\d)[\s(]+\d[\d \u00A0\u202F]*отзыв/i.exec(text)?.[1]))
  const m = new RegExp(`(${NUM})\\s*продав`, 'i').exec(text)
    ?? /продав\S*\s*\(\s*(\d+)\s*\)/i.exec(text)
  return { price, reviews, rating: rate, sellers: int(m?.[1]) }
}

const KASPI_IMAGE = /^https:\/\/(?:[a-z0-9-]+\.)*(?:kaspi\.kz|cdn-kaspi\.kz)\/\S+$/i

/**
 * Карточки выдачи поиска → товары. Карточку закладка находит без знания
 * вёрстки: ссылка на /shop/p/ и ближайший её предок с ценой «₸».
 */
export function parseKaspiCards(raw: KaspiPageRaw): KaspiCandidate[] {
  const seen = new Set<string>()
  const out: KaspiCandidate[] = []
  for (const c of (Array.isArray(raw.cards) ? raw.cards : []).slice(0, KASPI_CARDS_LIMIT)) {
    const url = normalizeKaspiUrl(c?.href)
    const title = typeof c?.title === 'string' ? c.title.replace(/\s+/g, ' ').trim().slice(0, 300) : ''
    if (!url || !url.includes('/shop/p/') || !title || seen.has(url))
      continue
    seen.add(url)
    const nums = numbersFromText(typeof c.text === 'string' ? c.text : '')
    const image = typeof c.img === 'string' && KASPI_IMAGE.test(c.img) ? c.img : null
    out.push({ url, title, image, text: typeof c.text === 'string' ? c.text.slice(0, 400) : '', ...nums })
  }
  return out
}

/** Страница товара Kaspi, а не выдача */
export const isKaspiProductUrl = (url: string) => /^https:\/\/kaspi\.kz\/shop\/p\//.test(url)

/**
 * Разбор сырья со страницы Kaspi. Сначала JSON-LD — разметка для поисковиков,
 * она стабильнее вёрстки; чего в ней нет — по видимому тексту. Вёрстку Kaspi
 * при написании не смотрели (сервер и сессия агента на kaspi.kz не ходят):
 * текстовые правила — по тому, как магазины обычно пишут цифры, а всё
 * ненайденное владелец видит и добирает руками.
 */
export function parseKaspiPage(raw: KaspiPageRaw): KaspiParsed {
  const p = ldProduct(Array.isArray(raw.ld) ? raw.ld : [])
  const offers = p ? ([] as any[]).concat(p.offers ?? [])[0] ?? null : null
  const agg = p?.aggregateRating ?? null
  const text = typeof raw.text === 'string' ? raw.text : ''

  const t = numbersFromText(text)
  const price = num(offers?.price) ?? num(offers?.lowPrice) ?? t.price
  const reviews = num(agg?.reviewCount) ?? num(agg?.ratingCount) ?? t.reviews
  const rate = rating(num(agg?.ratingValue)) ?? t.rating
  const sellers = num(offers?.offerCount) ?? t.sellers

  const title = String(p?.name ?? raw.title ?? '').replace(/\s*[|–—-]\s*Kaspi.*$/i, '').trim().slice(0, 300)
  const fields: KaspiFields = { title, price: price == null ? null : Math.round(price), reviews: reviews == null ? null : Math.round(reviews), rating: rate, sellers: sellers == null ? null : Math.round(sellers) }
  const found = (Object.keys(fields) as (keyof KaspiFields)[]).filter(k => k === 'title' ? !!fields.title : fields[k] != null)
  return { ...fields, url: normalizeKaspiUrl(raw.url), found }
}

/** Сырьё в часть адреса после «#»: base64 от UTF-8 JSON, безопасный для адреса */
export function encodeKaspiHash(raw: KaspiPageRaw): string {
  const bytes = new TextEncoder().encode(JSON.stringify(raw))
  let bin = ''
  for (const b of bytes)
    bin += String.fromCharCode(b)
  return `kaspi=${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
}

export function decodeKaspiHash(hash: string): KaspiPageRaw | null {
  const m = /(?:^#?|&)kaspi=([\w-]+)/.exec(hash)
  if (!m)
    return null
  try {
    const b64 = m[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const bin = atob(b64 + '='.repeat((4 - b64.length % 4) % 4))
    const raw = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0))))
    if (!raw || typeof raw !== 'object')
      return null
    return {
      url: typeof raw.url === 'string' ? raw.url : '',
      title: typeof raw.title === 'string' ? raw.title : '',
      ld: Array.isArray(raw.ld) ? raw.ld.filter((s: unknown) => typeof s === 'string') : [],
      text: typeof raw.text === 'string' ? raw.text.slice(0, KASPI_TEXT_LIMIT) : '',
      cards: Array.isArray(raw.cards)
        ? raw.cards.slice(0, KASPI_CARDS_LIMIT).filter((c: unknown) => c && typeof c === 'object').map((c: Record<string, unknown>) => ({
            href: typeof c.href === 'string' ? c.href : '',
            title: typeof c.title === 'string' ? c.title : '',
            text: typeof c.text === 'string' ? c.text.slice(0, 1000) : '',
            img: typeof c.img === 'string' ? c.img : '',
          }))
        : [],
    }
  }
  catch {
    return null
  }
}

/**
 * Закладка «Uhti ← Kaspi». Собирает сырьё и открывает страницу «Kaspi» в
 * админке `origin`. Base64 — как у encodeKaspiHash: btoa по UTF-8 байтам.
 */
export function kaspiBookmarklet(origin: string): string {
  const src = `(function(){var d={url:location.href,title:document.title,`
    + `ld:Array.prototype.map.call(document.querySelectorAll('script[type="application/ld+json"]'),function(s){return s.textContent||''}),`
    + `text:(document.body.innerText||'').slice(0,${KASPI_TEXT_LIMIT}),cards:[]};`
    // Карточки выдачи: ссылка на товар и ближайший предок с ценой «₸»; ссылка-картинка без текста — пропуск
    + `var seen={};Array.prototype.forEach.call(document.querySelectorAll('a[href*="/shop/p/"]'),function(a){`
    + `if(d.cards.length>=${KASPI_CARDS_LIMIT})return;var h=a.href.split('#')[0].split('?')[0];if(seen[h])return;`
    + `var el=a,n=0;while(el.parentElement&&n<8&&(el.innerText||'').indexOf('\u20B8')<0){el=el.parentElement;n++}`
    + `var im=el.querySelector('img'),t=(a.innerText||a.title||'').trim();if(!t)return;seen[h]=1;`
    + `d.cards.push({href:h,title:t.slice(0,300),text:(el.innerText||'').slice(0,1000),img:im?(im.currentSrc||im.src||im.getAttribute('data-src')||''):''})});`
    + `var b=new TextEncoder().encode(JSON.stringify(d)),s='';for(var i=0;i<b.length;i++)s+=String.fromCharCode(b[i]);`
    + `window.open(${JSON.stringify(`${origin.replace(/\/$/, '')}/admin/kaspi#kaspi=`)}+btoa(s).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,''),${JSON.stringify(KASPI_WINDOW)})})()`
  return `javascript:${encodeURIComponent(src)}`
}

/**
 * Сводки по замерам: ключ — тема или «товар поставщика:номер в посте».
 * Прирост отзывов — между самым ранним и последним замером того же товара
 * Kaspi (по адресу; без адреса — по самой цели).
 */
export function kaspiSummaries(rows: KaspiSnapshot[], keyOf: (s: KaspiSnapshot) => string | null): Map<string, KaspiSummary> {
  const groups = new Map<string, KaspiSnapshot[]>()
  for (const r of rows) {
    const key = keyOf(r)
    if (key == null)
      continue
    const list = groups.get(key)
    if (list)
      list.push(r)
    else
      groups.set(key, [r])
  }
  const out = new Map<string, KaspiSummary>()
  for (const [key, list] of groups) {
    const sorted = [...list].sort((a, b) => Date.parse(a.takenAt) - Date.parse(b.takenAt) || a.id - b.id)
    const last = sorted[sorted.length - 1]!
    const same = sorted.filter(s => s.url === last.url && s.reviews != null)
    const first = same[0]
    let reviewsGrowth: number | null = null
    let growthDays: number | null = null
    if (first && first !== last && last.reviews != null && first.reviews != null) {
      reviewsGrowth = last.reviews - first.reviews
      growthDays = Math.max(0, Math.round((Date.parse(last.takenAt) - Date.parse(first.takenAt)) / 86_400_000))
    }
    out.set(key, { last, reviewsGrowth, growthDays, count: list.length })
  }
  return out
}

export const offerKaspiKey = (offerId: string, item: number | null) => `${offerId}:${item ?? 0}`

export interface KaspiSnapshotInput extends KaspiFields {
  topicId: string | null
  offerId: string | null
  offerItem: number | null
  url: string | null
  source: KaspiSource
}

const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i

/** Проверка замера с формы; строка — текст ошибки для владельца */
export function parseKaspiInput(body: unknown): KaspiSnapshotInput | string {
  const b = (body ?? {}) as Record<string, unknown>
  const id = (v: unknown) => (typeof v === 'string' && UUID.test(v) ? v : null)
  const topicId = id(b.topicId)
  const offerId = id(b.offerId)
  if (!topicId === !offerId)
    return 'Выберите тему или товар поставщика'
  const count = (v: unknown, max: number) => {
    if (v == null || v === '')
      return null
    const n = num(v)
    return n != null && Number.isInteger(n) && n <= max ? n : Number.NaN
  }
  const price = count(b.price, 100_000_000)
  const reviews = count(b.reviews, 10_000_000)
  const sellers = count(b.sellers, 100_000)
  const rateRaw = b.rating == null || b.rating === '' ? null : num(b.rating)
  if ([price, reviews, sellers].some(n => Number.isNaN(n)))
    return 'Цена, отзывы и продавцы — целые числа'
  if (rateRaw != null && rateRaw > 5)
    return 'Рейтинг — от 0 до 5'
  if (b.rating != null && b.rating !== '' && rateRaw == null)
    return 'Рейтинг — число от 0 до 5'
  if ([price, reviews, sellers, rateRaw].every(n => n == null))
    return 'Нет ни одной цифры'
  const rawUrl = typeof b.url === 'string' ? b.url.trim() : ''
  const url = normalizeKaspiUrl(rawUrl)
  if (rawUrl && !url)
    return 'Ссылка — только на kaspi.kz'
  const item = offerId && b.offerItem != null ? count(b.offerItem, 100) : null
  if (Number.isNaN(item))
    return 'Неверный номер товара в посте'
  const source = b.source
  if (source !== 'page' && source !== 'screenshot' && source !== 'manual')
    return 'Неверный источник'
  return {
    topicId,
    offerId,
    offerItem: item,
    url,
    title: typeof b.title === 'string' ? b.title.trim().slice(0, 300) : '',
    price,
    reviews,
    rating: rateRaw == null ? null : Math.round(rateRaw * 10) / 10,
    sellers,
    source,
  }
}

/** Ответ ИИ по скриншоту → товары; кривое пропускается */
export function parseKaspiReadReply(raw: string): KaspiFields[] {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  let data: unknown
  try {
    data = JSON.parse(text)
  }
  catch {
    return []
  }
  const items = (data as { items?: unknown })?.items
  if (!Array.isArray(items))
    return []
  return items.flatMap((it) => {
    if (!it || typeof it !== 'object')
      return []
    const o = it as Record<string, unknown>
    const whole = (v: unknown) => {
      const n = num(v)
      return n == null ? null : Math.round(n)
    }
    const fields: KaspiFields = {
      title: typeof o.title === 'string' ? o.title.trim().slice(0, 300) : '',
      price: whole(o.price),
      reviews: whole(o.reviews),
      rating: rating(num(o.rating)),
      sellers: whole(o.sellers),
    }
    return fields.title || [fields.price, fields.reviews, fields.rating, fields.sellers].some(v => v != null) ? [fields] : []
  })
}

const group = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')

/** «отзыв», «отзыва», «отзывов» */
function plural(n: number, one: string, few: string, many: string) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20)
    return many
  return b === 1 ? one : b >= 2 && b <= 4 ? few : many
}

/** Части строки «Kaspi» на карточке: цена, отзывы с приростом, рейтинг, продавцы */
export function kaspiLineParts(s: KaspiSummary): string[] {
  const l = s.last
  // Владелец отметил «На Kaspi такого нет» — замер «0 продавцов» без цены и отзывов
  if (l.sellers === 0 && l.price == null && !l.reviews)
    return ['нет на Kaspi']
  const parts: string[] = []
  if (l.price != null)
    parts.push(`${group(l.price)}\u00A0₸`)
  if (l.reviews != null) {
    let r = `${group(l.reviews)}\u00A0${plural(l.reviews, 'отзыв', 'отзыва', 'отзывов')}`
    if (s.reviewsGrowth != null && s.growthDays != null)
      r += ` (${s.reviewsGrowth >= 0 ? '+' : '−'}${group(Math.abs(s.reviewsGrowth))} за\u00A0${s.growthDays}\u00A0дн.)`
    parts.push(r)
  }
  if (l.rating != null)
    parts.push(`★\u00A0${l.rating.toFixed(1).replace('.', ',')}`)
  if (l.sellers != null)
    parts.push(`${group(l.sellers)}\u00A0${plural(l.sellers, 'продавец', 'продавца', 'продавцов')}`)
  return parts
}
