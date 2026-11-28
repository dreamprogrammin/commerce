import { describe, expect, it } from 'vitest'
import { validGtin } from '@/utils/gtin'

/** Дописывает верную контрольную цифру GS1 — чтобы отвергался префикс, а не опечатка */
function withCheck(body: string): string {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const n = Number(body[body.length - 1 - i])
    sum += i % 2 === 0 ? n * 3 : n
  }
  return body + String((10 - (sum % 10)) % 10)
}

describe('validGtin', () => {
  it('принимает настоящий EAN-13 и отвергает «8497» из базы', () => {
    expect(validGtin('4006381333931')).toBe('4006381333931')
    expect(validGtin('4006381333932')).toBeNull() // неверная контрольная цифра
    expect(validGtin('8497')).toBeNull()
    expect(validGtin(null)).toBeNull()
  })

  /*
   * Google Merchant Center: «Don't submit a GTIN in the restricted ranges…
   * prefixes: 02, 04, or 2» и «…coupon ranges… 05, 98 or 99»
   * (support.google.com/merchants/answer/6324461). Такие коды печатают
   * магазины и поставщики на свои этикетки — на «Приёмке по факту» их
   * привязывают к товару, и в фид они уходить не должны.
   */
  it('внутренние коды и купоны в длине 13 — не GTIN: 2…, 02, 04, 05, 98, 99', () => {
    for (const body of ['200000000001', '210000000003', '290000000005', '020000000001', '040000000001', '050000000001', '980000000001', '990000000001']) {
      const code = withCheck(body)
      expect(code).toHaveLength(13)
      expect(validGtin(code), code).toBeNull()
    }
  })

  it('двенадцать цифр — с нулём впереди: 2…, 4… и 5… — это 02, 04 и 05', () => {
    for (const body of ['20000000001', '40000000001', '50000000001']) {
      const code = withCheck(body)
      expect(code).toHaveLength(12)
      expect(validGtin(code), code).toBeNull()
    }
  })

  it('четырнадцать цифр — префикс после цифры упаковки', () => {
    expect(validGtin(withCheck('1200000000001'))).toBeNull()
    expect(validGtin(withCheck('1040000000001'))).toBeNull()
    expect(validGtin(withCheck('0990000000001'))).toBeNull()
    const box = withCheck('1400638133393')
    expect(validGtin(box)).toBe(box)
  })

  it('восемь цифр на 0 и 2 — внутренние коды компании по GS1 (RCN-8)', () => {
    expect(validGtin(withCheck('2000001'))).toBeNull()
    expect(validGtin(withCheck('0123456'))).toBeNull()
    expect(validGtin('96385074')).toBe('96385074')
  })

  it('настоящие коды не задеты: 4… — Германия, а не 04; книги 978; UPC на 0 и 3', () => {
    for (const code of ['4006381333931', '9780306406157', '036000291452', '0036000291452', withCheck('690123456789'), withCheck('30000000001'), withCheck('977123456700')])
      expect(validGtin(code), code).toBe(code)
  })
})
