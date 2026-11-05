import type { OrderSheetLine } from './orderSheet'

/**
 * «Товары поставщиков» (4 ноября 2026) — что видит страница
 * /admin/supplier-offers и как группирует. Владелец 4.11: «ссылки можно
 * собирать в админке чтобы было удобно можно разгруппировать» — по
 * поставщикам, по дням или одним списком. Собирает товары
 * server/utils/supplierOffers.ts.
 */

export const OFFER_STATUSES = ['new', 'added', 'skipped'] as const
export type OfferStatus = (typeof OFFER_STATUSES)[number]

export function isOfferStatus(value: unknown): value is OfferStatus {
  return OFFER_STATUSES.includes(value as OfferStatus)
}

export interface OfferChannel {
  id: string
  title: string
  supplierName: string
  /** По приглашению — читается аккаунтом Telegram */
  closed: boolean
  collectedAt: string | null
}

/**
 * Товар поста, как его прочла модель ИИ (5 ноября 2026; читает
 * server/utils/supplierVision.ts). Владелец 4.11: «актуальная цена в чате,
 * если её нет — он читает из картинки, там также написан артикул».
 */
export interface OfferItem {
  name: string
  article: string | null
  brand: string | null
  /** Цена по правилу владельца: из подписи, нет в подписи — с фото */
  price: number | null
  priceFrom: 'text' | 'image' | null
  /** Цена на фото, когда в подписи другая, — показать обе */
  imagePrice: number | null
  /** «опт», «от 3 шт», цена за упаковку — дословно, как у поставщика */
  priceNote: string | null
  age: string | null
  /** high — прочитано чётко; иначе в doubt — что под сомнением */
  confidence: 'high' | 'medium' | 'low'
  doubt: string | null
}

export interface Offer {
  id: string
  channelId: string
  postedAt: string
  caption: string
  postUrl: string
  /** Первое фото; null — не скачалось */
  photoUrl: string | null
  photoCount: number
  status: OfferStatus
  statusAt: string | null
  /** Прочитано ИИ; null — ещё не читали или не прочёлся */
  items: OfferItem[] | null
  /** Почему не прочёлся */
  readError: string | null
}

/** Чтение ИИ на странице «Товары поставщиков» */
export interface OfferReading {
  /** `провайдер/модель` со страницы «Модели ИИ» */
  model: string
  /** Задан ли ключ провайдера этой модели */
  key: boolean
  /** Новые товары с фото, ещё не прочитанные */
  unread: number
  /** Из них не прочлись — причина на карточке */
  failed: number
}

/** «anthropic/claude-haiku-5-5» → «Claude Haiku 5.5»; незнакомая модель — как есть, без провайдера */
export function modelLabel(spec: string): string {
  const model = spec.slice(spec.indexOf('/') + 1)
  const m = /^claude-([a-z]+)-(\d+)(?:-(\d+))?$/.exec(model)
  if (!m)
    return model
  const family = m[1]!
  return `Claude ${family[0]!.toUpperCase()}${family.slice(1)} ${m[2]}${m[3] ? `.${m[3]}` : ''}`
}

/** $ за миллион токенов — вход и выход; официальные цены Anthropic на 5.11.2026 */
export const VISION_PRICES: Record<string, readonly [number, number]> = {
  'anthropic/claude-haiku-5-5': [0.10, 0.50],
  'anthropic/claude-sonnet-5-5': [2, 10],
  'anthropic/claude-opus-5-5': [4, 20],
}

/** Удачные чтения модели за 30 дней — из supplier_offers_read_summary() */
export interface VisionModelSpend {
  model: string
  posts: number
  inputTokens: number
  outputTokens: number
}

/** Во что обошлось чтение, $; null — цен какой-то из моделей здесь нет */
export function visionCost(models: VisionModelSpend[]): number | null {
  let cost = 0
  for (const m of models) {
    const price = VISION_PRICES[m.model]
    if (!price)
      return null
    cost += (m.inputTokens * price[0] + m.outputTokens * price[1]) / 1e6
  }
  return cost
}

export type OfferGrouping = 'supplier' | 'day' | 'none'

export interface OfferGroup {
  key: string
  /** Пусто — один общий список */
  title: string
  offers: Offer[]
}

const TZ = 'Asia/Almaty'
const dayKey = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso))

/** «Сегодня», «Вчера» или «3 ноября» — по времени Алматы */
export function dayTitle(iso: string, now = new Date()): string {
  const key = dayKey(iso)
  if (key === dayKey(now.toISOString()))
    return 'Сегодня'
  if (key === dayKey(new Date(now.getTime() - 86_400_000).toISOString()))
    return 'Вчера'
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: TZ })
}

export function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

/** Когда канал собирали в последний раз */
export function collectedText(iso: string | null, now = new Date()): string {
  if (!iso)
    return 'ещё не собирали'
  const day = dayTitle(iso, now)
  return `собрано ${day === 'Сегодня' || day === 'Вчера' ? day.toLowerCase() : day} в ${timeOf(iso)}`
}

/** Группы от свежих к старым, внутри — тоже */
export function groupOffers(offers: Offer[], channels: OfferChannel[], by: OfferGrouping, now = new Date()): OfferGroup[] {
  const sorted = [...offers].sort((a, b) => b.postedAt.localeCompare(a.postedAt))
  if (by === 'none')
    return sorted.length ? [{ key: 'all', title: '', offers: sorted }] : []
  const supplier = new Map(channels.map(c => [c.id, c.supplierName || c.title]))
  const groups = new Map<string, OfferGroup>()
  for (const offer of sorted) {
    const key = by === 'day' ? dayKey(offer.postedAt) : supplier.get(offer.channelId) ?? 'Канал удалён'
    const group = groups.get(key) ?? { key, title: by === 'day' ? dayTitle(offer.postedAt, now) : key, offers: [] }
    group.offers.push(offer)
    groups.set(key, group)
  }
  return [...groups.values()]
}

/** Товар поставщика для «На сайт» — ответ /api/admin/supplier-offers/draft */
export interface OfferDraftSource {
  id: string
  caption: string
  postUrl: string
  photoUrl: string | null
  supplierId: string | null
  supplierName: string | null
  items: OfferItem[] | null
}

/** Что форма нового товара берёт из поста; чего нет — остаётся пустым */
export interface ProductDraft {
  name: string
  sku: string | null
  /** Цена поставщика — закупочная, не розничная: розничную ставит владелец */
  costPrice: number | null
  supplierId: string | null
}

/**
 * Черновик товара сайта из товара поставщика (5 ноября 2026): товар поста
 * под номером `item` — его название, артикул и цена; товара не прочитано —
 * только поставщик, остальное владелец впишет сам.
 */
export function productDraft(source: OfferDraftSource, item = 0): ProductDraft {
  const it = source.items?.[item] ?? null
  return {
    name: it?.name ?? '',
    sku: it?.article ?? null,
    costPrice: it?.price != null && it.price > 0 ? Math.round(it.price) : null,
    supplierId: source.supplierId,
  }
}

/**
 * Строка заказа поставщику из товара поста (5 ноября 2026): `item` — номер
 * товара, прочитанного ИИ; null — пост не прочитан, строка — первой строкой
 * подписи. Количество — 1, владелец поправит.
 */
export function offerOrderLine(offer: Pick<Offer, 'id' | 'caption' | 'postUrl' | 'photoUrl' | 'items'>, item: number | null, supplier: string): OrderSheetLine & { key: string } {
  const it = item == null ? null : offer.items?.[item] ?? null
  const firstLine = offer.caption.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  return {
    key: `${offer.id}:${item ?? '-'}`,
    supplier,
    name: it?.name || firstLine.slice(0, 120),
    article: it?.article ?? null,
    price: it?.price != null && it.price > 0 ? it.price : null,
    quantity: 1,
    photoUrl: offer.photoUrl,
    link: offer.postUrl,
  }
}
