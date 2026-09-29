interface CheckoutItem { id: string | number, name: string, price: number, quantity: number }

export function useEcommerceTracking() {
  const { gtag } = useGtag()

  const trackViewItem = (product: { id: string | number, name: string, price: number, category?: string }) => {
    gtag('event', 'view_item', {
      currency: 'KZT',
      value: product.price,
      items: [{
        item_id: String(product.id),
        item_name: product.name,
        price: product.price,
        item_category: product.category,
        quantity: 1,
      }],
    })
  }

  const trackAddToCart = (product: { id: string | number, name: string, price: number, quantity?: number }) => {
    gtag('event', 'add_to_cart', {
      currency: 'KZT',
      value: product.price * (product.quantity || 1),
      items: [{
        item_id: String(product.id),
        item_name: product.name,
        price: product.price,
        quantity: product.quantity || 1,
      }],
    })
  }

  const trackRemoveFromCart = (product: { id: string | number, name: string, price: number, quantity?: number }) => {
    gtag('event', 'remove_from_cart', {
      currency: 'KZT',
      value: product.price * (product.quantity || 1),
      items: [{
        item_id: String(product.id),
        item_name: product.name,
        price: product.price,
        quantity: product.quantity || 1,
      }],
    })
  }

  const trackBeginCheckout = (items: Array<{ id: string | number, name: string, price: number, quantity: number }>, totalValue: number) => {
    gtag('event', 'begin_checkout', {
      currency: 'KZT',
      value: totalValue,
      items: items.map(item => ({
        item_id: String(item.id),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    })
  }

  const trackPurchase = (orderId: string, items: Array<{ id: string | number, name: string, price: number, quantity: number }>, totalValue: number) => {
    gtag('event', 'purchase', {
      transaction_id: orderId,
      currency: 'KZT',
      value: totalValue,
      items: items.map(item => ({
        item_id: String(item.id),
        item_name: item.name,
        price: item.price,
        quantity: item.quantity,
      })),
    })
  }

  /*
   * Шаги между «начал оформление» и «купил» (29 сентября 2026). Без них не
   * видно, на каком шаге человек уходит. Имена и поля — стандартные события
   * GA4: отчёт «Воронка покупок» собирается из них сам.
   */
  const gaItems = (items: CheckoutItem[]) => items.map(item => ({
    item_id: String(item.id),
    item_name: item.name,
    price: item.price,
    quantity: item.quantity,
  }))

  /** Открыл корзину с товарами. */
  const trackViewCart = (items: CheckoutItem[], totalValue: number) => {
    gtag('event', 'view_cart', { currency: 'KZT', value: totalValue, items: gaItems(items) })
  }

  /** Заполнил данные доставки: контакты и адрес или пункт самовывоза. */
  const trackAddShippingInfo = (items: CheckoutItem[], totalValue: number, shippingTier: string) => {
    gtag('event', 'add_shipping_info', { currency: 'KZT', value: totalValue, shipping_tier: shippingTier, items: gaItems(items) })
  }

  /** Нажал «Оформить», и форма прошла проверку. */
  const trackAddPaymentInfo = (items: CheckoutItem[], totalValue: number, paymentType: string) => {
    gtag('event', 'add_payment_info', { currency: 'KZT', value: totalValue, payment_type: paymentType, items: gaItems(items) })
  }

  return {
    trackViewCart,
    trackAddShippingInfo,
    trackAddPaymentInfo,
    trackViewItem,
    trackAddToCart,
    trackRemoveFromCart,
    trackBeginCheckout,
    trackPurchase,
  }
}
