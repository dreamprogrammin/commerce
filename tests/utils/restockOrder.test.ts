import type { RestockItem } from '../../utils/restockOrder'
import { describe, expect, it } from 'vitest'
import { draftRows, orderText, orderTotals, plural, pluralPositions, whatsappUrl } from '../../utils/restockOrder'

function item(over: Partial<RestockItem> & { id: string }): RestockItem {
  return { name: over.id, sku: null, stock: 0, minStock: 2, restockQty: 5, costPrice: 1000, ...over }
}

describe('draftRows', () => {
  const items = [
    item({ id: 'b', name: 'Б', stock: 2 }),
    item({ id: 'a', name: 'А', stock: 0 }),
    item({ id: 'full', name: 'Полный', stock: 10 }),
    item({ id: 'v', name: 'В', stock: 2 }),
  ]

  it('сами попадают товары на пороге и ниже, с количеством из правила; меньше остаток — выше', () => {
    expect(draftRows(items).map(r => [r.item.id, r.quantity, r.manual])).toEqual([
      ['a', 5, false],
      ['b', 5, false],
      ['v', 5, false],
    ])
  })

  it('правка количества, убранный товар остаётся строкой с нулём, добавленный вручную — в конце', () => {
    const rows = draftRows(items, { b: 0, a: 12, full: 3 })
    expect(rows.map(r => [r.item.id, r.quantity, r.manual])).toEqual([
      ['a', 12, false],
      ['b', 0, false],
      ['v', 5, false],
      ['full', 3, true],
    ])
  })

  it('добавленный вручную с нулём из заказа уходит', () => {
    expect(draftRows(items, { full: 0 }).some(r => r.item.id === 'full')).toBe(false)
  })
})

describe('orderTotals', () => {
  it('считает только строки с количеством; закупка — где известна', () => {
    const rows = draftRows([
      item({ id: 'a', costPrice: 1000 }),
      item({ id: 'b', costPrice: null }),
      item({ id: 'c', costPrice: 500 }),
    ], { c: 0, b: 2 })
    expect(orderTotals(rows)).toEqual({ positions: 2, units: 7, cost: 5000, withoutCost: 1 })
  })
})

describe('orderText', () => {
  it('артикул, название и штуки; без артикула — только название; убранные не пишутся', () => {
    const rows = draftRows([
      item({ id: 'a', name: ' LEGO City 60410 ', sku: '60410', stock: 0 }),
      item({ id: 'b', name: 'Погремушка', sku: null, stock: 1 }),
      item({ id: 'c', name: 'Убранный', sku: 'X1', stock: 1 }),
    ], { b: 3, c: 0 })
    expect(orderText(rows, new Date('2026-10-30T20:30:00Z'))).toBe([
      'Здравствуйте! Заказ от магазина «Ухтышка», 31.10.2026:',
      '',
      '1. 60410 — LEGO City 60410 — 5 шт.',
      '2. Погремушка — 3 шт.',
      '',
      'Всего: 2 позиции, 8 шт.',
    ].join('\n'))
  })
})

describe('plural', () => {
  it('склоняет', () => {
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map(pluralPositions))
      .toEqual(['позиция', 'позиции', 'позиций', 'позиций', 'позиций', 'позиция', 'позиции', 'позиций', 'позиций'])
    expect([21, 3, 14].map(n => plural(n, 'товар', 'товара', 'товаров'))).toEqual(['товар', 'товара', 'товаров'])
  })
})

describe('whatsappUrl', () => {
  it('любая запись казахстанского номера — wa.me с цифрами и закодированным текстом', () => {
    for (const phone of ['+7 777 123 45 67', '+7 (777) 123-45-67', '+77771234567', '87771234567'])
      expect(whatsappUrl(phone, 'Заказ: 1 шт.')).toBe(`https://wa.me/77771234567?text=${encodeURIComponent('Заказ: 1 шт.')}`)
  })

  it('нет номера — null', () => {
    expect(whatsappUrl(null, 'x')).toBeNull()
    expect(whatsappUrl('12-34', 'x')).toBeNull()
  })
})
