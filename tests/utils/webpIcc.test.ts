import { describe, expect, it } from 'vitest'
import { stripWebpIcc, stripWebpIccBytes } from '@/utils/webpIcc'

/*
 * Настоящее превью категории из боевой базы (13 октября 2026): WebP 20 px с
 * профилем sRGB от canvas Chrome. Блок ICCP — 464 байта из 770.
 */
const REAL = 'data:image/webp;base64,UklGRvoCAABXRUJQVlA4WAoAAAAwAAAAEwAAEwAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDhMDAEAAC8TwAQQH8Gm1rYl/4+7z+46MXEIQRerQgkSUIHDSgCYfWKjhqJIkpojZ/jmYAwx8McNgpDiNAIAJMI9uctiVJ+DAZiCI7nDNP7NpappI8nx3Yf+y0cQET77WH88h3sb/ZHWeK9f78/7HtqLlVWn2WjNKH3giDMUAA9eicgSEBePGQtOCOSPULqfAnI3el2oyo5NNXS/aEhumqk5xCKo7SxCIBRAOxRxMCBc6E7DLDiMJNu0ns1vs/NP8hsBRPRfgds2yph38AsAAAAAAAAAAAAAAAAAAAAA0hnOl+s7rbu32vdvQfIWRO8tC05vcHNg6LtFXTIu2ZjeAlsULapVHnNcZ/Pnc8L7SZM//AU='

function decode(dataUrl: string): Uint8Array {
  return Uint8Array.from(atob(dataUrl.split(',')[1]!), c => c.charCodeAt(0))
}
function chunks(bytes: Uint8Array): string[] {
  const out: string[] = []
  for (let i = 12; i + 8 <= bytes.length;) {
    const size = bytes[i + 4]! | (bytes[i + 5]! << 8) | (bytes[i + 6]! << 16) | (bytes[i + 7]! << 24)
    out.push(String.fromCharCode(...bytes.subarray(i, i + 4)))
    i += 8 + size + (size & 1)
  }
  return out
}

describe('stripWebpIcc', () => {
  const stripped = stripWebpIcc(REAL)
  const before = decode(REAL)
  const after = decode(stripped)

  it('вырезает блок ICCP и только его', () => {
    expect(chunks(before)).toContain('ICCP')
    expect(chunks(after)).toEqual(chunks(before).filter(c => c !== 'ICCP'))
    expect(before.length - after.length).toBe(464)
  })

  it('пересчитывает размер RIFF и гасит флаг ICC в VP8X', () => {
    const riff = after[4]! | (after[5]! << 8) | (after[6]! << 16) | (after[7]! << 24)
    expect(riff).toBe(after.length - 8)
    expect(before[20]! & 0x20).toBe(0x20)
    expect(after[20]! & 0x20).toBe(0)
  })

  it('повторный вызов ничего не меняет', () => {
    expect(stripWebpIcc(stripped)).toBe(stripped)
  })

  it('не WebP и битые данные возвращает как есть', () => {
    expect(stripWebpIcc('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=')
    expect(stripWebpIcc('data:image/webp;base64,%%%')).toBe('data:image/webp;base64,%%%')
    expect(stripWebpIccBytes(before.subarray(0, 40))).toBeNull()
  })
})
