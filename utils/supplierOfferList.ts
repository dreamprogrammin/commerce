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
