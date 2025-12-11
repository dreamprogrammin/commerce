import type { OrderData } from './types.ts'

export function formatOrderMessage(order: OrderData, confirmUrl: string, cancelUrl: string): {
  text: string
  replyMarkup: Record<string, unknown>
} {
  const customerName = order.profile?.first_name
    ? `${order.profile.first_name} ${order.profile.last_name || ''}`.trim()
    : order.guest_name || 'Не указано'

  const customerPhone = order.profile?.phone || order.guest_phone || 'Не указан'
  const customerEmail = order.guest_email || 'Не указан'
  const orderDate = new Date(order.created_at).toLocaleString('ru-RU', { timeZone: 'Asia/Almaty' })

  let text = `🔔 *Новый заказ №...${order.id.slice(-6)}*\n\n`
  text += `*Дата:* ${orderDate}\n`
  text += `*Клиент:* ${customerName}\n`
  text += `*Телефон:* \`${customerPhone}\`\n`
  text += `*Email:* ${customerEmail}\n\n`

  text += `*Состав заказа:*\n`
  order.order_items.forEach((item) => {
    const productName = item.product?.name || 'Неизвестный товар'
    text += `• ${productName} ×${item.quantity}\n`
  })

  text += `\n*Сумма:* ${order.final_amount} ₸\n`
  text += `*Оплата:* ${order.payment_method || 'Не указано'}\n`
  text += `*Доставка:* ${order.delivery_method === 'courier' ? '🚗 Курьер' : '🏪 Самовывоз'}\n`

  if (order.delivery_method === 'courier' && order.delivery_address) {
    text += `*Адрес:* ${order.delivery_address.city}, ${order.delivery_address.line1}\n`
  }

  const replyMarkup = {
    inline_keyboard: [
      [
        { text: '✅ Подтвердить', url: confirmUrl },
        { text: '❌ Отменить', url: cancelUrl },
      ],
    ],
  }

  return { text, replyMarkup }
}