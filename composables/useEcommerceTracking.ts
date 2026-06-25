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

  return {
    trackViewItem,
    trackAddToCart,
    trackRemoveFromCart,
    trackBeginCheckout,
    trackPurchase,
  }
}
