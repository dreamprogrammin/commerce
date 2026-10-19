import { describe, expect, it } from 'vitest'
import { buildOrderEmail, EMAIL_STATUSES, orderEmailCopy, orderEmailSubject, tenge } from '../../supabase/functions/_shared/orderEmailTemplate'

/**
 * Письма покупателю о заказе (29 сентября 2026): форма оформления обещает
 * «Email для чека и статуса заказа», а писем не было вовсе.
 */

const SHOP = { phoneHuman: '+7 (702) 537-94-73', phoneHref: 'tel:+77025379473', address: 'г. Алматы, мкр. Шапагат, ул. Амангельды, 100', hours: 'ежедневно с 9:00 до 22:00' }
const BASE = { orderNumber: 1004, statusUrl: 'https://uhti.kz/order/t/ec55733a3fec', total: 18480, shop: SHOP }

describe('письма о заказе', () => {
  it('пишем только когда покупателю нужно что-то сделать или узнать важное', () => {
    // Решение владельца 29 сентября: «принят» и «готов / везут»; 13 октября
    // добавлено «доставлен» — ради ссылок на отзыв без входа
    expect(EMAIL_STATUSES).toEqual(['shipped', 'delivered', 'cancelled'])
  })

  it('все письма заказа — одна тема и одна цепочка', () => {
    const kinds = ['created', 'shipped', 'delivered', 'cancelled'] as const
    const subjects = kinds.map(kind => orderEmailCopy({ ...BASE, kind, deliveryMethod: 'pickup' }).subject)
    expect(new Set(subjects)).toEqual(new Set([orderEmailSubject(1004)]))
    expect(orderEmailSubject(1004)).toBe('Заказ №1004 — Ухтышка')
  })

  it('«заказ принят» — состав, доставка, итог и ссылка на статус', () => {
    const m = buildOrderEmail({
      ...BASE,
      kind: 'created',
      deliveryMethod: 'courier',
      deliveryCost: 1000,
      items: [{ name: 'Толокар <Sport>', quantity: 2, price: 8890 }],
    })
    expect(m.subject).toBe('Заказ №1004 — Ухтышка')
    expect(m.html).toContain('https://uhti.kz/order/t/ec55733a3fec')
    expect(m.html).toContain('Толокар &lt;Sport&gt; × 2')
    expect(m.html).toContain(tenge(17780))
    expect(m.text).toContain('Доставка — 1\u00A0000\u00A0₸')
    expect(m.text).toContain('Итого — 18\u00A0480\u00A0₸')
  })

  it('«передан»: курьеру — в пути, самовывоз — готов к выдаче с адресом и часами', () => {
    expect(orderEmailCopy({ ...BASE, kind: 'shipped', deliveryMethod: 'courier' }).heading).toBe('Заказ №1004 в пути')
    const pickup = orderEmailCopy({ ...BASE, kind: 'shipped', deliveryMethod: 'pickup', pickup: { name: 'Шапагат', address: 'ул. Амангельды, 100', hours: '9:00–22:00' } })
    expect(pickup.heading).toBe('Заказ №1004 готов к выдаче')
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

  it('«доставлен» — кнопка «Оставить отзыв» у каждого товара, ссылки и в текстовой версии', () => {
    const reviewLinks = [
      { name: 'Кукла <LOL>', url: 'https://uhti.kz/review/aaa' },
      { name: 'Толокар', url: 'https://uhti.kz/review/bbb' },
    ]
    const m = buildOrderEmail({ ...BASE, kind: 'delivered', deliveryMethod: 'pickup', reviewLinks })
    expect(m.html.match(/>Оставить отзыв</g)).toHaveLength(2)
    expect(m.html).toContain('href="https://uhti.kz/review/aaa"')
    expect(m.html).toContain('Кукла &lt;LOL&gt;')
    expect(m.text).toContain('Кукла <LOL> — https://uhti.kz/review/aaa')
    expect(m.text).toContain('Толокар — https://uhti.kz/review/bbb')
    expect(m.text).toContain('входить на сайт не нужно')
    expect(m.html).toContain('https://uhti.kz/order/t/ec55733a3fec')
  })

  it('ссылки на отзыв — только в письме «доставлен»', () => {
    const reviewLinks = [{ name: 'Толокар', url: 'https://uhti.kz/review/bbb' }]
    for (const kind of ['created', 'confirmed', 'shipped', 'cancelled'] as const) {
      const m = buildOrderEmail({ ...BASE, kind, deliveryMethod: 'courier', reviewLinks })
      expect(m.html).not.toContain('Оставить отзыв')
      expect(m.text).not.toContain('/review/')
    }
    expect(buildOrderEmail({ ...BASE, kind: 'delivered', deliveryMethod: 'courier' }).html).not.toContain('Оцените покупку')
  })

  it('письмо о статусе — без состава, но со ссылкой; ₸ не отрывается от числа', () => {
    const m = buildOrderEmail({ ...BASE, kind: 'confirmed', deliveryMethod: 'courier' })
    expect(m.html).not.toContain('Итого')
    expect(m.text).toContain('Статус заказа: https://uhti.kz/order/t/ec55733a3fec')
    expect(tenge(18480)).not.toMatch(/\d ₸|\d \d{3}/)
  })
})

/*
 * Посылка в другой город (`post`, с 19 октября 2026): цену доставки называют
 * после взвешивания, в сумме заказа её нет — письмо не должно обещать ни
 * курьера, ни «платить заранее не нужно».
 */
describe('письма о посылке в другой город', () => {
  it('«принят» — про взвешивание и оплату Kaspi до отправки', () => {
    const c = orderEmailCopy({ ...BASE, kind: 'created', deliveryMethod: 'post' })
    expect(c.lead).toContain('взвесим посылку')
    expect(c.lead).toContain('Kaspi')
    expect(c.lead).not.toContain('Платить заранее не нужно')
  })

  it('«отправлен» и «получен» — без курьера', () => {
    const shipped = orderEmailCopy({ ...BASE, kind: 'shipped', deliveryMethod: 'post' })
    expect(shipped.heading).toBe('Заказ №1004 отправлен')
    expect(shipped.lead).toContain('Kazpost или CDEK')
    expect(shipped.lead).not.toMatch(/курьер/i)
    expect(orderEmailCopy({ ...BASE, kind: 'delivered', deliveryMethod: 'post' }).heading).toBe('Заказ №1004 получен')
  })

  it('в итогах доставка «по весу», а сумма — «без доставки»', () => {
    const m = buildOrderEmail({
      ...BASE,
      kind: 'created',
      deliveryMethod: 'post',
      deliveryCost: 0,
      total: 17780,
      items: [{ name: 'Толокар', quantity: 2, price: 8890 }],
    })
    expect(m.text).toContain('Доставка — по весу посылки, сообщим до отправки')
    expect(m.text).toContain('Итого без доставки — 17\u00A0780\u00A0₸')
    expect(m.html).toContain('Итого без доставки')
  })
})
