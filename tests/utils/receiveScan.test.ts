import type { SupplierOrderLine } from '../../utils/supplierOrders'
import { describe, expect, it } from 'vitest'
import { createScanGate, lineForScan, readReceiveDraft, receiveLineCheck, receiveTotals, sameScanCode, SCAN_ABSENT_MS, scanCode } from '../../utils/receiveScan'

function line(productId: string | null, quantity: number, received = 0, sku: string | null = null): SupplierOrderLine {
  return { productId, name: `Товар ${productId}`, sku, quantity, received, costPrice: null }
}

describe('коды', () => {
  it('без пробелов', () => {
    expect(scanCode(' 4601 2345 ')).toBe('46012345')
  })
  it('цифровые: UPC-A и EAN-13 с нулём впереди — один код; буквенные — без учёта регистра', () => {
    expect(sameScanCode('012345678905', '0012345678905')).toBe(true)
    expect(sameScanCode('4601234567890', '4601234567891')).toBe(false)
    expect(sameScanCode('ab-12', 'AB-12')).toBe(true)
    expect(sameScanCode('', '')).toBe(false)
  })
})

describe('lineForScan', () => {
  const lines = [line('a', 3, 0, 'BG1544'), line('b', 2), line(null, 1, 0, 'GONE')]
  const products = { a: { barcode: null, sku: 'BG1544' }, b: { barcode: '4601234567890', sku: null } }
  it('по штрихкоду товара', () => {
    expect(lineForScan(lines, products, '4601234567890')).toEqual({ line: lines[1], via: 'barcode' })
  })
  it('по артикулу — набранному в любом регистре', () => {
    expect(lineForScan(lines, products, 'bg1544')).toEqual({ line: lines[0], via: 'sku' })
  })
  it('строка удалённого товара и чужой код — нет', () => {
    expect(lineForScan(lines, products, 'GONE')).toBeNull()
    expect(lineForScan(lines, products, '999')).toBeNull()
    expect(lineForScan(lines, products, '  ')).toBeNull()
  })
})

describe('сверка', () => {
  it('строка: ждём остаток после прежних приёмок', () => {
    expect(receiveLineCheck({ quantity: 5, received: 2 }, 3)).toEqual({ state: 'ok', diff: 0 })
    expect(receiveLineCheck({ quantity: 5, received: 2 }, 0)).toEqual({ state: 'none', diff: 3 })
    expect(receiveLineCheck({ quantity: 5, received: 2 }, 1)).toEqual({ state: 'short', diff: 2 })
    expect(receiveLineCheck({ quantity: 5, received: 2 }, 4)).toEqual({ state: 'over', diff: 1 })
    expect(receiveLineCheck({ quantity: 5, received: 5 }, 0)).toEqual({ state: 'ok', diff: 0 })
  })
  it('итоги: непосчитанное — в недостаче, лишнее отдельно, удалённые мимо', () => {
    const order = { lines: [line('a', 3), line('b', 2), line('c', 1, 1), line(null, 4)] }
    expect(receiveTotals(order, { a: 2, b: 4, c: 0 })).toEqual({ counted: 6, expected: 5, shortLines: 1, shortUnits: 1, overLines: 1, overUnits: 2 })
    expect(receiveTotals(order, {})).toEqual({ counted: 0, expected: 5, shortLines: 2, shortUnits: 5, overLines: 0, overUnits: 0 })
  })
})

describe('камера: тот же товар ещё в кадре', () => {
  it('код в каждом кадре — одна штука; пропал и вернулся — вторая', () => {
    const gate = createScanGate()
    const hits = [0, 150, 300, 450, 600].map(t => gate.seen('4601234567890', t))
    expect(hits).toEqual([true, false, false, false, false])
    expect(gate.seen('4601234567890', 600 + SCAN_ABSENT_MS - 1)).toBe(false)
    expect(gate.seen('4601234567890', 600 + SCAN_ABSENT_MS - 1 + SCAN_ABSENT_MS)).toBe(true)
  })
  it('один товар в UPC-A и EAN-13 — один ключ; другой товар — сразу', () => {
    const gate = createScanGate()
    expect(gate.seen('012345678905', 0)).toBe(true)
    expect(gate.seen('0012345678905', 100)).toBe(false)
    expect(gate.seen('4601234567890', 200)).toBe(true)
  })
  it('камеру выключали или открывали окно — коробка в кадре та же штука', () => {
    const gate = createScanGate()
    expect(gate.seen('4601234567890', 0)).toBe(true)
    expect(gate.seen('4601234567890', 500)).toBe(false)
    gate.pause(600)
    gate.pause(900) // повторная пауза отсчёт не сдвигает
    gate.resume(10_600)
    expect(gate.seen('4601234567890', 10_700)).toBe(false)
    gate.resume(20_000) // без паузы — ничего
    expect(gate.seen('4601234567890', 10_700 + SCAN_ABSENT_MS - 1)).toBe(false)
  })
  it('код пропал ещё до паузы — после неё считается снова', () => {
    const gate = createScanGate()
    expect(gate.seen('4601234567890', 0)).toBe(true)
    gate.pause(SCAN_ABSENT_MS + 500)
    gate.resume(60_000)
    expect(gate.seen('4601234567890', 60_000)).toBe(true)
  })
  it('коды «в кадре» — для счёта в телефоне; на паузе — на её начало', () => {
    const gate = createScanGate()
    gate.seen('0012345678905', 0)
    gate.seen('4601234567890', 900)
    expect(gate.present(950).sort()).toEqual(['12345678905', '4601234567890'])
    gate.pause(1600)
    expect(gate.present(99_000)).toEqual(['4601234567890'])
  })
  it('после перезагрузки: сохранённый код «в кадре» до первых кадров без него', () => {
    const gate = createScanGate()
    gate.hold(['4601234567890'], 5000)
    gate.resume(60_000)
    expect(gate.seen('4601234567890', 60_100)).toBe(false)
    expect(gate.seen('012345678905', 60_100)).toBe(true)
    expect(gate.seen('4601234567890', 60_100 + SCAN_ABSENT_MS)).toBe(true)
  })
})

describe('сохранённый счёт', () => {
  it('только строки заказа и целые 1–9999', () => {
    const raw = JSON.stringify({ counts: { a: 2, b: 0, c: 3, d: 1.5, e: 10000, x: 4 }, savedAt: '2026-11-27T10:00:00.000Z', base: 1 })
    expect(readReceiveDraft(raw, ['a', 'b', 'c', 'd', 'e'])).toEqual({ counts: { a: 2, c: 3 }, savedAt: '2026-11-27T10:00:00.000Z', base: 1, held: [] })
    const withHeld = JSON.stringify({ counts: { a: 1 }, savedAt: '2026-11-27T10:00:00.000Z', base: 0, held: ['4601234567890', 5, '', 'x'.repeat(65)] })
    expect(readReceiveDraft(withHeld, ['a'])?.held).toEqual(['4601234567890'])
  })
  it('мусор, пустой счёт и счёт без отметки «сколько было принято» — null', () => {
    expect(readReceiveDraft(null, ['a'])).toBeNull()
    expect(readReceiveDraft('[object Object]', ['a'])).toBeNull()
    expect(readReceiveDraft(JSON.stringify({ counts: {}, savedAt: '2026-11-27T10:00:00.000Z', base: 0 }), ['a'])).toBeNull()
    expect(readReceiveDraft(JSON.stringify({ counts: { a: 1 }, savedAt: 'вчера', base: 0 }), ['a'])).toBeNull()
    expect(readReceiveDraft(JSON.stringify({ counts: { a: 1 }, savedAt: '2026-11-27T10:00:00.000Z' }), ['a'])).toBeNull()
    expect(readReceiveDraft(JSON.stringify({ counts: { a: 1 }, savedAt: '2026-11-27T10:00:00.000Z', base: -1 }), ['a'])).toBeNull()
  })
})
