import { describe, expect, it } from 'vitest'
import { matchesUserQuery, normalizePhone, summarizeOrders } from '../../utils/adminUsers'

describe('normalizePhone', () => {
  it('приводит разные записи одного номера к одному виду', () => {
    for (const phone of ['+7 (777) 123-45-67', '87771234567', '7771234567', '7 777 123 45 67'])
      expect(normalizePhone(phone)).toBe('77771234567')
  })

  it('пустой и непохожий номер — null', () => {
    expect(normalizePhone(null)).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('12345')).toBeNull()
  })
})

describe('summarizeOrders', () => {
  it('отменённые не считаются заказами, сумма — только по выполненным', () => {
    const s = summarizeOrders([
      { user_id: 'a', status: 'delivered', final_amount: '5000.00', created_at: '2026-10-01T10:00:00Z' },
      { user_id: 'a', status: 'completed', final_amount: 3000, created_at: '2026-10-05T10:00:00Z' },
      { user_id: 'a', status: 'new', final_amount: 9000, created_at: '2026-10-03T10:00:00Z' },
      { user_id: 'a', status: 'cancelled', final_amount: 7000, created_at: '2026-10-07T10:00:00Z' },
      { user_id: null, status: 'delivered', final_amount: 100, created_at: '2026-10-07T10:00:00Z' },
    ])
    expect(s.get('a')).toEqual({ orders: 3, cancelled: 1, spent: 8000, lastOrderAt: '2026-10-07T10:00:00Z' })
    expect(s.size).toBe(1)
  })
})

describe('matchesUserQuery', () => {
  const user = { name: 'Айгерим Нурланова', phone: '+7 (777) 123-45-67', email: 'aigerim@mail.kz' }

  it('находит по телефону в любой записи', () => {
    expect(matchesUserQuery(user, '8777 123')).toBe(true)
    expect(matchesUserQuery(user, '87771234567')).toBe(true)
    expect(matchesUserQuery(user, '+7 777 123 45 67')).toBe(true)
    expect(matchesUserQuery(user, '7011234567')).toBe(false)
    expect(matchesUserQuery(user, '1234567')).toBe(true)
    expect(matchesUserQuery(user, '777 123')).toBe(true)
  })

  it('находит по имени и email без учёта регистра', () => {
    expect(matchesUserQuery(user, 'айгерим')).toBe(true)
    expect(matchesUserQuery(user, 'MAIL.KZ')).toBe(true)
    expect(matchesUserQuery(user, 'Болат')).toBe(false)
  })
})
