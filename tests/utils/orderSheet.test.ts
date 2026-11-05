import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildOrderWorkbook, groupOrderLines, orderFileName, sheetNames } from '@/utils/orderSheet'

// Белый пиксель PNG — exceljs не проверяет содержимое, ему нужен base64
const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII='

function line(over: Partial<Parameters<typeof groupOrderLines>[0][number]> = {}) {
  return {
    supplier: 'AmrToys',
    name: 'Кукла',
    article: 'HXJ11',
    price: 2400,
    quantity: 3,
    photoUrl: 'https://x/1.jpg',
    link: 'https://t.me/a/1',
    ...over,
  }
}

describe('groupOrderLines', () => {
  it('по поставщикам, со штуками и суммой; без цены — в счёт неполноты, нулевое количество — мимо', () => {
    const groups = groupOrderLines([
      line(),
      line({ supplier: 'Оптом', price: null, quantity: 2 }),
      line({ name: 'Машинка', price: 1000, quantity: 1 }),
      line({ quantity: 0 }),
    ])
    expect(groups.map(g => [g.supplier, g.lines.length, g.units, g.sum, g.unpriced])).toEqual([
      ['AmrToys', 2, 4, 8200, 0],
      ['Оптом', 1, 2, 0, 1],
    ])
  })
})

describe('sheetNames', () => {
  it('запрещённые знаки, 31 знак и повторы', () => {
    expect(sheetNames(['A/B: [опт]', 'x'.repeat(40), 'AmrToys', 'amrtoys', ''])).toEqual([
      'A B опт',
      'x'.repeat(31),
      'AmrToys',
      'amrtoys 2',
      'Поставщик',
    ])
  })
})

describe('orderFileName', () => {
  it('дата по Алматы и поставщик латиницей и кириллицей', () => {
    const d = new Date('2026-11-05T20:00:00Z') // в Алматы уже 6-е
    expect(orderFileName(d)).toBe('zakaz-2026-11-06.xlsx')
    expect(orderFileName(d, 'Оптом Игрушки «Алматы»')).toBe('zakaz-Оптом-Игрушки-Алматы-2026-11-06.xlsx')
    expect(orderFileName(d, 'Опт', 12)).toBe('zakaz-12-Опт-2026-11-06.xlsx')
  })
})

describe('buildOrderWorkbook', () => {
  it('лист на поставщика: строки, фото, итог формулой; нет фото — надпись', async () => {
    const groups = groupOrderLines([line(), line({ name: 'Машинка', article: null, price: null, quantity: 1, photoUrl: null, link: null }), line({ supplier: 'Оптом' })])
    const asked: string[] = []
    const bytes = await buildOrderWorkbook(groups, new Date('2026-11-05T06:00:00Z'), async (url) => {
      asked.push(url)
      return PIXEL
    })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes)
    expect(book.worksheets.map(w => w.name)).toEqual(['AmrToys', 'Оптом'])
    const ws = book.getWorksheet('AmrToys')!
    expect(ws.getCell('A1').value).toBe('Заказ магазина «Ухтышка» — AmrToys, 05.11.2026')
    expect(ws.getRow(4).values).toEqual(expect.arrayContaining([1, 'Кукла', 'HXJ11', 2400, 3]))
    expect(ws.getCell('G4').value).toMatchObject({ formula: 'E4*F4', result: 7200 })
    expect(ws.getCell('H4').value).toMatchObject({ hyperlink: 'https://t.me/a/1' })
    expect(ws.getCell('B5').value).toBe('нет фото')
    expect(ws.getCell('C6').value).toBe('Итого')
    expect(ws.getCell('F6').value).toMatchObject({ result: 4 })
    expect(ws.getCell('G6').value).toMatchObject({ result: 7200 })
    expect(ws.getCell('C7').value).toBe('Без цены: 1 — сумма их не включает')
    expect(ws.getImages()).toHaveLength(1)
    expect(asked).toEqual(['https://x/1.jpg', 'https://x/1.jpg'])
  })

  it('фото не загрузилось — строка остаётся, с надписью', async () => {
    const bytes = await buildOrderWorkbook(groupOrderLines([line()]), new Date(), async () => {
      throw new Error('CORS')
    })
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes)
    expect(book.worksheets[0]!.getCell('B4').value).toBe('нет фото')
    expect(book.worksheets[0]!.getImages()).toHaveLength(0)
  })
})
