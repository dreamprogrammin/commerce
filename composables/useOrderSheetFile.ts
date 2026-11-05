/**
 * Браузерная половина таблицы заказа (utils/orderSheet.ts): фото для ячеек и
 * сохранение файла. Отдельно — utils видит и сервер, а там нет document.
 */
import { PHOTO_PX } from '@/utils/orderSheet'

/** В браузере: фото по ссылке → квадратный JPEG для ячейки (WebP Excel не откроет) */
export async function jpegForSheet(url: string): Promise<string | null> {
  const res = await fetch(url)
  if (!res.ok)
    return null
  const bitmap = await createImageBitmap(await res.blob())
  const side = PHOTO_PX * 2
  const canvas = document.createElement('canvas')
  canvas.width = side
  canvas.height = side
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, side, side)
  const scale = Math.min(side / bitmap.width, side / bitmap.height)
  const w = bitmap.width * scale
  const h = bitmap.height * scale
  ctx.drawImage(bitmap, (side - w) / 2, (side - h) / 2, w, h)
  bitmap.close()
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? null
}

/** В браузере: отдать файл на сохранение */
export function saveOrderFile(bytes: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
