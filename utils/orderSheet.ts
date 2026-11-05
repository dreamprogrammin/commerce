/**
 * Таблица заказа поставщику — файл Excel с фото (5 ноября 2026). Владелец
 * 5.11: «пусть формируется список товара, который мне нужен, в понятную
 * таблицу с картинками для заказа, которую я могу скачать и передать
 * поставщику». Один лист на поставщика: фото, название, артикул, цена,
 * количество, сумма и ссылка на пост.
 *
 * exceljs весит ~1 МБ — грузится `import()` только по нажатию «Скачать».
 * Фото готовит страница (`loadImage`): Excel не понимает WebP, поэтому
 * картинку она пережимает в JPEG.
 */

export interface OrderSheetLine {
  supplier: string
  name: string
  article: string | null
  /** Цена за штуку у поставщика; null — не знаем */
  price: number | null
  quantity: number
  photoUrl: string | null
  /** Пост поставщика, по которому выбран товар */
  link: string | null
}

export interface OrderSheetGroup {
  supplier: string
  lines: OrderSheetLine[]
  units: number
  /** Сумма по строкам с ценой */
  sum: number
  /** Строк без цены — сумма неполная */
  unpriced: number
}

/** JPEG в base64 без префикса data:, или null — фото не будет */
export type LoadImage = (url: string) => Promise<string | null>

export function groupOrderLines(lines: OrderSheetLine[]): OrderSheetGroup[] {
  const groups = new Map<string, OrderSheetGroup>()
  for (const line of lines) {
    if (line.quantity <= 0)
      continue
    let g = groups.get(line.supplier)
    if (!g) {
      g = { supplier: line.supplier, lines: [], units: 0, sum: 0, unpriced: 0 }
      groups.set(line.supplier, g)
    }
    g.lines.push(line)
    g.units += line.quantity
    if (line.price != null)
      g.sum += line.price * line.quantity
    else
      g.unpriced++
  }
  return [...groups.values()]
}

/** Имя листа Excel: до 31 знака, без []:*?/\, имена не повторяются */
export function sheetNames(suppliers: string[]): string[] {
  const used = new Set<string>()
  return suppliers.map((s) => {
    const base = (s.replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim() || 'Поставщик').slice(0, 31)
    let name = base
    for (let n = 2; used.has(name.toLowerCase()); n++)
      name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`
    used.add(name.toLowerCase())
    return name
  })
}

export function orderFileName(date: Date, supplier?: string): string {
  const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Almaty' }).format(date)
  const who = supplier ? `-${supplier.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')}` : ''
  return `zakaz${who}-${day}.xlsx`
}

/** Сторона фото в ячейке, px */
export const PHOTO_PX = 96
const MONEY = '#,##0 "₸"'

/** Книга Excel заказа — байты файла */
export async function buildOrderWorkbook(groups: OrderSheetGroup[], date: Date, loadImage: LoadImage): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs')
  const book = new ExcelJS.Workbook()
  book.creator = 'Ухтышка'
  book.created = date
  const day = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Almaty', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)
  const names = sheetNames(groups.map(g => g.supplier))

  for (const [gi, g] of groups.entries()) {
    const ws = book.addWorksheet(names[gi], { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 } })
    ws.columns = [
      { key: 'n', width: 5 },
      { key: 'photo', width: 15 },
      { key: 'name', width: 46 },
      { key: 'article', width: 16 },
      { key: 'price', width: 12 },
      { key: 'qty', width: 9 },
      { key: 'sum', width: 14 },
      { key: 'link', width: 30 },
    ]
    ws.mergeCells('A1:H1')
    ws.getCell('A1').value = `Заказ магазина «Ухтышка» — ${g.supplier}, ${day}`
    ws.getCell('A1').font = { bold: true, size: 14 }
    const head = ws.getRow(3)
    head.values = ['№', 'Фото', 'Товар', 'Артикул', 'Цена', 'Кол-во, шт.', 'Сумма', 'Пост']
    head.font = { bold: true }
    head.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    head.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } }
    })
    ws.views = [{ state: 'frozen', ySplit: 3 }]

    // Фото — параллельно, но не все сразу
    const photos: (string | null)[] = Array.from({ length: g.lines.length }, () => null)
    let next = 0
    await Promise.all(Array.from({ length: Math.min(4, g.lines.length) }, async () => {
      while (next < g.lines.length) {
        const i = next++
        const url = g.lines[i]!.photoUrl
        photos[i] = url ? await loadImage(url).catch(() => null) : null
      }
    }))

    for (const [i, line] of g.lines.entries()) {
      const r = 4 + i
      const row = ws.getRow(r)
      row.values = [
        i + 1,
        photos[i] ? '' : 'нет фото',
        line.name || 'Без названия',
        line.article ?? '',
        line.price ?? '',
        line.quantity,
        line.price != null ? { formula: `E${r}*F${r}`, result: line.price * line.quantity } : '',
        line.link ? { text: 'Открыть пост', hyperlink: line.link } : '',
      ]
      row.height = PHOTO_PX * 0.75 + 6
      row.alignment = { vertical: 'middle', wrapText: true }
      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(2).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(2).font = { color: { argb: 'FF999999' }, size: 9 }
      row.getCell(5).numFmt = MONEY
      row.getCell(6).alignment = { vertical: 'middle', horizontal: 'center' }
      row.getCell(7).numFmt = MONEY
      if (line.link)
        row.getCell(8).font = { color: { argb: 'FF0563C1' }, underline: true }
      if (photos[i]) {
        const id = book.addImage({ base64: photos[i]!, extension: 'jpeg' })
        ws.addImage(id, { tl: { col: 1.08, row: r - 1 + 0.04 }, ext: { width: PHOTO_PX, height: PHOTO_PX }, editAs: 'oneCell' })
      }
    }

    const last = 3 + g.lines.length
    const total = ws.getRow(last + 1)
    total.values = ['', '', 'Итого', '', '', { formula: `SUM(F4:F${last})`, result: g.units }, { formula: `SUM(G4:G${last})`, result: g.sum }, '']
    total.font = { bold: true }
    total.getCell(6).alignment = { horizontal: 'center' }
    total.getCell(7).numFmt = MONEY
    if (g.unpriced)
      ws.getCell(`C${last + 2}`).value = `Без цены: ${g.unpriced} — сумма их не включает`

    for (let r = 3; r <= last + 1; r++) {
      ws.getRow(r).eachCell({ includeEmpty: true }, (c) => {
        c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      })
    }
  }
  return await book.xlsx.writeBuffer() as ArrayBuffer
}
