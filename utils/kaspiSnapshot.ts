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
}

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

  let price = num(offers?.price) ?? num(offers?.lowPrice)
  if (price == null) {
    // Первая цена, за которой не идёт «× 12» — то рассрочка
    price = int(new RegExp(`(${NUM})\\s*₸(?!\\s*[x×х]\\s*\\d)`).exec(text)?.[1])
  }

  let reviews = num(agg?.reviewCount) ?? num(agg?.ratingCount)
  if (reviews == null)
    reviews = int(new RegExp(`(${NUM})\\s*отзыв`, 'i').exec(text)?.[1])

  let rate = rating(num(agg?.ratingValue))
  if (rate == null) {
    const m = /\b([0-5][.,]\d)[\s(]+\d[\d \u00A0\u202F]*отзыв/i.exec(text)
    rate = rating(num(m?.[1]))
  }

  let sellers = num(offers?.offerCount)
  if (sellers == null) {
    const m = new RegExp(`(${NUM})\\s*продав`, 'i').exec(text)
      ?? /продав\S*\s*\(\s*(\d+)\s*\)/i.exec(text)
    sellers = int(m?.[1])
  }

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
    + `text:(document.body.innerText||'').slice(0,${KASPI_TEXT_LIMIT})};`
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
