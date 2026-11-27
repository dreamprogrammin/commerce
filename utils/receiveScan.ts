import type { DeliveryProduct, SupplierOrder, SupplierOrderLine } from './supplierOrders'
import { remaining } from './supplierOrders'

/**
 * Приёмка по факту (27 ноября 2026). Владелец: «я же не буду бегать с
 * товарами к ноутбуку… я должен принимать товар по факту, а не по списку;
 * у SAP можно выгружать на ТСД». Экран приёмки на телефоне
 * (pages/admin/deliveries/receive/[order].vue): камера, сканер или «+1» у
 * строки считают, что пришло на самом деле, и только это уходит в
 * admin_receive_supplier_order — она с 31.10.2026 принимает любое число от 0.
 *
 * Здесь — без браузера и сети: какой строке заказа принадлежит код, сверка
 * строки и итоги, «тот же товар ещё в кадре» у камеры, сохранённый счёт.
 */

/** Что приёмке нужно знать о товаре строки, кроме самой строки */
export interface ScanProduct {
  barcode: string | null
  sku: string | null
}

/** Товар строки на экране приёмки: фото, остаток, ждущие — как в «Поставках», плюс штрихкод и артикул */
export type ReceiveProductInfo = DeliveryProduct & ScanProduct

/** Ответ GET /api/admin/deliveries/[id]/receive */
export interface ReceiveOrderData {
  order: SupplierOrder
  supplier: { id: string, name: string } | null
  products: Record<string, ReceiveProductInfo>
  /** Штрихкоды товаров не из этого заказа: «это „X“ — его в заказе нет» без запроса к серверу */
  otherBarcodes: { productId: string, name: string, barcode: string }[]
}

/** Код, как его прочитали камера или сканер: без пробелов */
export function scanCode(raw: string): string {
  return raw.replace(/\s+/g, '')
}

/**
 * Ключ сравнения. У цифровых — без ведущих нулей: один и тот же товар камера
 * читает то UPC-A (12 цифр), то EAN-13 с нулём впереди. У прочих — без учёта
 * регистра.
 */
function codeKey(raw: string): string {
  const code = scanCode(raw)
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, '') : code.toUpperCase()
}

export function sameScanCode(a: string, b: string): boolean {
  const x = scanCode(a)
  const y = scanCode(b)
  return Boolean(x && y) && codeKey(x) === codeKey(y)
}

export interface ScanMatch {
  line: SupplierOrderLine
  /** Нашлась по штрихкоду товара или по артикулу (набран руками, напечатан на коробке) */
  via: 'barcode' | 'sku'
}

/** Строка заказа по коду; строки удалённых товаров (productId null) принять нельзя — их нет */
export function lineForScan(lines: SupplierOrderLine[], products: Record<string, ScanProduct>, raw: string): ScanMatch | null {
  const code = scanCode(raw)
  if (!code)
    return null
  const receivable = lines.filter((l): l is SupplierOrderLine & { productId: string } => Boolean(l.productId))
  const byBarcode = receivable.find((l) => {
    const barcode = products[l.productId]?.barcode
    return barcode ? sameScanCode(barcode, code) : false
  })
  if (byBarcode)
    return { line: byBarcode, via: 'barcode' }
  const bySku = receivable.find((l) => {
    const sku = products[l.productId]?.sku ?? l.sku
    return sku ? scanCode(sku).toUpperCase() === code.toUpperCase() : false
  })
  return bySku ? { line: bySku, via: 'sku' } : null
}

export type ReceiveLineState = 'none' | 'short' | 'ok' | 'over'

/**
 * Сверка строки: посчитано сейчас против того, что ещё ждём (заказано минус
 * принятое прежними приёмками). «none» — ещё не считали, а ждём.
 */
export function receiveLineCheck(line: Pick<SupplierOrderLine, 'quantity' | 'received'>, counted: number): { state: ReceiveLineState, diff: number } {
  const expected = remaining(line)
  if (counted === expected)
    return { state: 'ok', diff: 0 }
  if (counted === 0)
    return { state: 'none', diff: expected }
  if (counted < expected)
    return { state: 'short', diff: expected - counted }
  return { state: 'over', diff: counted - expected }
}

export interface ReceiveTotals {
  /** Посчитано штук */
  counted: number
  /** Ждём штук — по всем строкам */
  expected: number
  /** Строк и штук, которых не хватает, — вместе с непосчитанными */
  shortLines: number
  shortUnits: number
  overLines: number
  overUnits: number
}

export function receiveTotals(order: Pick<SupplierOrder, 'lines'>, counts: Record<string, number>): ReceiveTotals {
  const totals: ReceiveTotals = { counted: 0, expected: 0, shortLines: 0, shortUnits: 0, overLines: 0, overUnits: 0 }
  for (const line of order.lines) {
    if (!line.productId)
      continue
    const counted = counts[line.productId] ?? 0
    const expected = remaining(line)
    totals.counted += counted
    totals.expected += expected
    if (counted < expected) {
      totals.shortLines++
      totals.shortUnits += expected - counted
    }
    else if (counted > expected) {
      totals.overLines++
      totals.overUnits += counted - expected
    }
  }
  return totals
}

/** Камера видит один и тот же код в каждом кадре — считать, только если он пропадал хотя бы на столько */
export const SCAN_ABSENT_MS = 1000

/**
 * «Тот же товар ещё в кадре». Камера читает коробку по несколько раз в
 * секунду; штука считается, когда код появился впервые или после паузы — его
 * не было в кадре SCAN_ABSENT_MS. Десять одинаковых коробок подряд — десять
 * раз убрать и навести; недосчёт виден по счётчику, пересчёт был бы
 * незаметен.
 */
export function createScanGate(absentMs = SCAN_ABSENT_MS) {
  const lastSeen = new Map<string, number>()
  return {
    seen(raw: string, now: number): boolean {
      const key = codeKey(raw)
      const prev = lastSeen.get(key)
      lastSeen.set(key, now)
      return prev === undefined || now - prev >= absentMs
    },
    reset() {
      lastSeen.clear()
    },
  }
}

/** Счёт сохраняется в браузере на каждом касании: перезагрузка или звонок посреди приёмки его не теряют */
export interface ReceiveDraft {
  counts: Record<string, number>
  savedAt: string
  /**
   * Сколько штук по заказу было принято, когда начали этот счёт. Стало
   * больше — заказ принимали где-то ещё (окном «Принять» на ноутбуке), и
   * счёт устарел: «Принять» с него прибавило бы остаток второй раз.
   * Считается как orderSummary(order).receivedUnits.
   */
  base: number
}

export const receiveDraftKey = (orderId: string) => `admin-receive:${orderId}`

/** Сохранённый счёт — только по строкам этого заказа и только целые 0–9999; иначе null */
export function readReceiveDraft(raw: string | null, productIds: string[]): ReceiveDraft | null {
  if (!raw)
    return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  const { counts, savedAt, base } = parsed as { counts?: unknown, savedAt?: unknown, base?: unknown }
  if (!counts || typeof counts !== 'object' || Array.isArray(counts) || typeof savedAt !== 'string' || Number.isNaN(Date.parse(savedAt)))
    return null
  if (typeof base !== 'number' || !Number.isInteger(base) || base < 0)
    return null
  const ids = new Set(productIds)
  const clean: Record<string, number> = {}
  for (const [id, n] of Object.entries(counts as Record<string, unknown>)) {
    if (ids.has(id) && typeof n === 'number' && Number.isInteger(n) && n > 0 && n <= 9999)
      clean[id] = n
  }
  return Object.keys(clean).length ? { counts: clean, savedAt, base } : null
}
