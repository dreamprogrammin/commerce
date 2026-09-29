import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useEcommerceTracking } from '@/composables/useEcommerceTracking'

/**
 * Шаги оформления в Google Analytics (29 сентября 2026). В статистике были
 * только «добавил в корзину», «начал оформление» и «купил» — между ними
 * пусто, и не видно, на каком шаге человек уходит. Имена и поля — стандартные
 * события GA4, тогда отчёт «Воронка покупок» собирается сам.
 */

const gtag = vi.fn()
vi.stubGlobal('useGtag', () => ({ gtag }))

const ITEMS = [
  { id: 'p1', name: 'Толокар Sport 5566Y', price: 8890, quantity: 2 },
  { id: 42, name: 'Кукла L.O.L.', price: 10290, quantity: 1 },
]
const GA_ITEMS = [
  { item_id: 'p1', item_name: 'Толокар Sport 5566Y', price: 8890, quantity: 2 },
  { item_id: '42', item_name: 'Кукла L.O.L.', price: 10290, quantity: 1 },
]

describe('шаги оформления в GA4', () => {
  beforeEach(() => gtag.mockReset())

  it('view_cart — состав и сумма корзины', () => {
    useEcommerceTracking().trackViewCart(ITEMS, 28070)
    expect(gtag).toHaveBeenCalledWith('event', 'view_cart', { currency: 'KZT', value: 28070, items: GA_ITEMS })
  })

  it('add_shipping_info — со способом доставки', () => {
    useEcommerceTracking().trackAddShippingInfo(ITEMS, 28070, 'pickup')
    expect(gtag).toHaveBeenCalledWith('event', 'add_shipping_info', { currency: 'KZT', value: 28070, shipping_tier: 'pickup', items: GA_ITEMS })
  })

  it('add_payment_info — со способом оплаты', () => {
    useEcommerceTracking().trackAddPaymentInfo(ITEMS, 28070, 'kaspi')
    expect(gtag).toHaveBeenCalledWith('event', 'add_payment_info', { currency: 'KZT', value: 28070, payment_type: 'kaspi', items: GA_ITEMS })
  })

  it('прежние события не изменились', () => {
    useEcommerceTracking().trackBeginCheckout(ITEMS, 28070)
    expect(gtag).toHaveBeenCalledWith('event', 'begin_checkout', { currency: 'KZT', value: 28070, items: GA_ITEMS })
  })
})
