import { describe, expect, it } from 'vitest'
import { buildOrderEmail, EMAIL_STATUSES, orderEmailCopy, tenge } from '../../supabase/functions/_shared/orderEmailTemplate'

/**
 * Письма покупателю о заказе (29 сентября 2026): форма оформления обещает
 * «Email для чека и статуса заказа», а писем не было вовсе.
 */

const SHOP = { phoneHuman: '+7 (702) 537-94-73', phoneHref: 'tel:+77025379473', address: 'г. Алматы, мкр. Шапагат, ул. Амангельды, 100', hours: 'ежедневно с 9:00 до 22:00' }
const BASE = { orderNumber: 1004, statusUrl: 'https://uhti.kz/order/t/ec55733a3fec', total: 18480, shop: SHOP }

describe('письма о заказе', () => {
  it('пишем только о смене статуса, важной покупателю', () => {
    expect(EMAIL_STATUSES).toEqual(['confirmed', 'shipped', 'delivered', 'cancelled'])
  })

  it('«заказ принят» — состав, доставка, итог и ссылка на статус', () => {
    const m = buildOrderEmail({
      ...BASE,
      kind: 'created',
      deliveryMethod: 'courier',
      deliveryCost: 1000,
      items: [{ name: 'Толокар <Sport>', quantity: 2, price: 8890 }],
    })
    expect(m.subject).toBe('Заказ №1004 принят — Ухтышка')
    expect(m.html).toContain('https://uhti.kz/order/t/ec55733a3fec')
    expect(m.html).toContain('Толокар &lt;Sport&gt; × 2')
    expect(m.html).toContain(tenge(17780))
    expect(m.text).toContain('Доставка — 1\u00A0000\u00A0₸')
    expect(m.text).toContain('Итого — 18\u00A0480\u00A0₸')
  })

  it('«передан»: курьеру — в пути, самовывоз — готов к выдаче с адресом и часами', () => {
    expect(orderEmailCopy({ ...BASE, kind: 'shipped', deliveryMethod: 'courier' }).heading).toBe('Заказ №1004 в пути')
    const pickup = orderEmailCopy({ ...BASE, kind: 'shipped', deliveryMethod: 'pickup', pickup: { name: 'Шапагат', address: 'ул. Амангельды, 100', hours: '9:00–22:00' } })
    expect(pickup.subject).toBe('Заказ №1004 готов к выдаче — Ухтышка')
    expect(pickup.lead).toBe('Забрать можно здесь: Шапагат, ул. Амангельды, 100, 9:00–22:00.')
  })

  it('без пункта самовывоза — адрес и часы магазина', () => {
    expect(orderEmailCopy({ ...BASE, kind: 'shipped', deliveryMethod: 'pickup', pickup: null }).lead).toContain(SHOP.address)
  })

  it('выдан / доставлен / отменён', () => {
    expect(orderEmailCopy({ ...BASE, kind: 'delivered', deliveryMethod: 'pickup' }).heading).toBe('Заказ №1004 выдан')
    expect(orderEmailCopy({ ...BASE, kind: 'delivered', deliveryMethod: 'courier' }).heading).toBe('Заказ №1004 доставлен')
    expect(orderEmailCopy({ ...BASE, kind: 'cancelled', deliveryMethod: 'courier' }).lead).toContain(SHOP.phoneHuman)
  })

  it('письмо о статусе — без состава, но со ссылкой; ₸ не отрывается от числа', () => {
    const m = buildOrderEmail({ ...BASE, kind: 'confirmed', deliveryMethod: 'courier' })
    expect(m.html).not.toContain('Итого')
    expect(m.text).toContain('Статус заказа: https://uhti.kz/order/t/ec55733a3fec')
    expect(tenge(18480)).not.toMatch(/\d ₸|\d \d{3}/)
  })
})
