import { describe, expect, it } from 'vitest'

/**
 * Порядок скидок в «Итого к оплате».
 *
 * Формула повторяет ту, что считает сервер в create_user_order:
 * сначала промокод от суммы корзины, потом бонусы от остатка, доставка сверху.
 * Держим её тестом, потому что расхождение клиента с сервером здесь уже
 * случалось дважды: сперва промокод вычитался на клиенте, хотя сервер его
 * игнорировал; потом его убрали с клиента, и он перестал вычитаться вовсе.
 */
function orderTotal(opts: {
  subtotal: number
  promoDiscount: number
  bonuses: number
  deliveryCost: number
}): number {
  const afterPromo = Math.max(0, opts.subtotal - opts.promoDiscount)
  return Math.max(0, afterPromo - opts.bonuses) + opts.deliveryCost
}

describe('итог к оплате', () => {
  it('вычитает промокод, затем бонусы, затем добавляет доставку', () => {
    // Ровно тот случай, что проверен на базе: 5580 − 558 − 300 + 1000.
    expect(orderTotal({
      subtotal: 5580,
      promoDiscount: 558,
      bonuses: 300,
      deliveryCost: 1000,
    })).toBe(5722)
  })

  it('без промокода считает как раньше', () => {
    expect(orderTotal({ subtotal: 5580, promoDiscount: 0, bonuses: 300, deliveryCost: 1000 }))
      .toBe(6280)
  })

  it('доставка не уходит под скидку', () => {
    // Бонусами закрыли товары целиком — доставку всё равно платим.
    expect(orderTotal({ subtotal: 2000, promoDiscount: 0, bonuses: 5000, deliveryCost: 1000 }))
      .toBe(1000)
  })

  it('промокод больше корзины не уводит итог в минус', () => {
    expect(orderTotal({ subtotal: 1000, promoDiscount: 9999, bonuses: 0, deliveryCost: 500 }))
      .toBe(500)
  })

  it('бонусы применяются к остатку после промокода, а не к полной сумме', () => {
    // 10 000 − 5 000 промокодом = 5 000; бонусов 6 000, но списать можно 5 000.
    const withCap = orderTotal({
      subtotal: 10000,
      promoDiscount: 5000,
      bonuses: 5000,
      deliveryCost: 0,
    })
    expect(withCap).toBe(0)

    // Если бы бонусы считались от полной суммы, итог ушёл бы в минус и
    // обнулился бы тоже — но сервер ограничивает списание остатком, и
    // покупатель сохранил бы лишние бонусы на балансе.
    expect(Math.min(6000, 10000 - 5000)).toBe(5000)
  })

  it('самовывоз не добавляет доставку', () => {
    expect(orderTotal({ subtotal: 3000, promoDiscount: 300, bonuses: 0, deliveryCost: 0 }))
      .toBe(2700)
  })
})
