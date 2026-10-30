/**
 * Заказ поставщику со страницы «К закупке» (30 октября 2026).
 *
 * Владелец: «заказы должны собираться по поставщику». Заказ — товары одного
 * поставщика: дошедшие до порога попадают в него сами, с количеством из
 * правила товара; любые другие его товары добавляются вручную. Черновик —
 * только правки к автоматическому списку (`DraftEdits`), живёт в браузере до
 * шага с таблицей заказов поставщикам.
 */
import { normalizePhone } from './adminUsers'

export interface RestockItem {
  id: string
  name: string
  sku: string | null
  stock: number
  minStock: number
  restockQty: number
  costPrice: number | null
}

/** id товара → сколько брать (0 — не брать). Без записи — по правилу товара. */
export type DraftEdits = Record<string, number>

export interface DraftRow<T extends RestockItem = RestockItem> {
  item: T
  quantity: number
  /** Добавлен вручную: по порогу в заказ не попал бы */
  manual: boolean
}

export function needsRestock(item: Pick<RestockItem, 'stock' | 'minStock'>): boolean {
  return item.stock <= item.minStock
}

const byName = (a: RestockItem, b: RestockItem) => a.name.localeCompare(b.name, 'ru')

/**
 * Строки черновика поставщика: сначала дошедшие до порога (меньше остаток —
 * выше), в том числе убранные из заказа (количество 0), потом добавленные
 * вручную. `items` — товары только этого поставщика.
 */
export function draftRows<T extends RestockItem>(items: T[], edits: DraftEdits = {}): DraftRow<T>[] {
  const auto = items.filter(needsRestock)
    .sort((a, b) => a.stock - b.stock || byName(a, b))
    .map(item => ({ item, quantity: edits[item.id] ?? item.restockQty, manual: false }))
  const manual = items.filter(item => !needsRestock(item) && (edits[item.id] ?? 0) > 0)
    .sort(byName)
    .map(item => ({ item, quantity: edits[item.id]!, manual: true }))
  return [...auto, ...manual]
}

export interface OrderTotals {
  positions: number
  units: number
  /** Сумма по закупочной цене — только у строк, где она известна */
  cost: number
  /** Строк заказа без закупочной цены */
  withoutCost: number
}

export function orderTotals(rows: DraftRow[]): OrderTotals {
  const ordered = rows.filter(r => r.quantity > 0)
  return {
    positions: ordered.length,
    units: ordered.reduce((sum, r) => sum + r.quantity, 0),
    cost: ordered.reduce((sum, r) => sum + (r.item.costPrice ?? 0) * r.quantity, 0),
    withoutCost: ordered.filter(r => r.item.costPrice == null).length,
  }
}

/** Форма слова по числу: 1 товар, 2 товара, 5 товаров, 21 товар. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11)
    return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return few
  return many
}

export function pluralPositions(n: number): string {
  return plural(n, 'позиция', 'позиции', 'позиций')
}

/**
 * Текст заказа для поставщика: артикул, название, штуки. Артикул первым —
 * по нему поставщик ищет товар у себя; на 30.10.2026 он есть у всех 186
 * активных товаров.
 */
export function orderText(rows: DraftRow[], date: Date): string {
  const ordered = rows.filter(r => r.quantity > 0)
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  const lines = ordered.map((r, i) => {
    const sku = r.item.sku?.trim()
    return `${i + 1}. ${sku ? `${sku} — ` : ''}${r.item.name.trim()} — ${r.quantity} шт.`
  })
  const { positions, units } = orderTotals(ordered)
  return [
    `Здравствуйте! Заказ от магазина «Ухтышка», ${day}:`,
    '',
    ...lines,
    '',
    `Всего: ${positions} ${pluralPositions(positions)}, ${units} шт.`,
  ].join('\n')
}

/** Ссылка WhatsApp с готовым текстом; null — номер не похож на казахстанский. */
export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  const digits = normalizePhone(phone)
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null
}
