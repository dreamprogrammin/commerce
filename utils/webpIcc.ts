/**
 * Убирает цветовой профиль (блок ICCP) из WebP в data:URI.
 *
 * Зачем. Превью-размытие (`blur_placeholder`) делает `browser-image-compression`
 * через canvas Chrome, и тот вшивает в каждый WebP свой профиль sRGB
 * («sRGB», Google Inc. 2016) — блок ICCP 464 байта, 39% длины data:URI при самой
 * картинке 20×20. Замер 13 октября 2026: профиль есть у всех 1 046 превью
 * товаров и 61 превью категорий; на карточке товара 16 превью — около 10 КБ
 * разметки только на профилях. Картинка без профиля браузер и так считает
 * sRGB, так что цвета не меняются (проверено попиксельно на боевых превью).
 *
 * Что делается: блок ICCP вырезается, в заголовке VP8X гасится флаг ICC,
 * размер RIFF пересчитывается. Всё остальное — байт в байт. Не WebP, WebP без
 * профиля или битые данные возвращаются как есть.
 */
const ICC_FLAG = 0x20

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16) | (bytes[offset + 3]! << 24)) >>> 0
}

function writeU32LE(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xFF
  bytes[offset + 1] = (value >>> 8) & 0xFF
  bytes[offset + 2] = (value >>> 16) & 0xFF
  bytes[offset + 3] = (value >>> 24) & 0xFF
}

function tag(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
}

/** WebP-байты без блока ICCP или null, если убирать нечего. */
export function stripWebpIccBytes(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 12 || tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WEBP')
    return null

  const kept: Uint8Array[] = [bytes.subarray(0, 12)]
  let removed = false
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const size = readU32LE(bytes, offset + 4)
    const end = offset + 8 + size + (size & 1)
    if (end > bytes.length)
      return null
    if (tag(bytes, offset) === 'ICCP')
      removed = true
    else
      kept.push(bytes.subarray(offset, end))
    offset = end
  }
  if (!removed || offset !== bytes.length)
    return null

  const out = new Uint8Array(kept.reduce((sum, part) => sum + part.length, 0))
  let at = 0
  for (const part of kept) {
    out.set(part, at)
    at += part.length
  }
  writeU32LE(out, 4, out.length - 8)
  if (tag(out, 12) === 'VP8X')
    out[20] = out[20]! & ~ICC_FLAG
  return out
}

/** data:image/webp;base64 без профиля; всё прочее — без изменений. */
export function stripWebpIcc(dataUrl: string): string {
  const prefix = 'data:image/webp;base64,'
  if (!dataUrl.startsWith(prefix))
    return dataUrl
  try {
    const binary = atob(dataUrl.slice(prefix.length))
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0))
    const stripped = stripWebpIccBytes(bytes)
    if (!stripped)
      return dataUrl
    let out = ''
    for (const byte of stripped)
      out += String.fromCharCode(byte)
    return prefix + btoa(out)
  }
  catch {
    return dataUrl
  }
}
