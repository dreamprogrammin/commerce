import { describe, expect, it } from 'vitest'
import { validGtin } from '@/utils/gtin'

describe('validGtin', () => {
  it('принимает настоящий EAN-13 и отвергает «8497» из базы', () => {
    expect(validGtin('4006381333931')).toBe('4006381333931')
    expect(validGtin('4006381333932')).toBeNull() // неверная контрольная цифра
    expect(validGtin('8497')).toBeNull()
    expect(validGtin(null)).toBeNull()
  })
})
