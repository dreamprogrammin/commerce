/**
 * Сведения о магазине, которые уходят покупателю в Telegram.
 *
 * Держим константой, а не в базе: пункт выдачи один, таблица `pickup_points`
 * пуста, и ни у одного из 42 самовывозных заказов на проде поле
 * `pickup_point_id` не заполнено. Заводить справочник ради одной строки — это
 * ещё одно место, где данные разъедутся с сайтом.
 *
 * ВАЖНО: адрес обязан совпадать с тем, что написано на сайте
 * (`pages/about.vue`, `pages/terms.vue`, подвал и разметка главной). Меняете
 * здесь — поменяйте и там, иначе покупатель приедет не туда.
 *
 * Если пунктов станет больше одного, правильное место — `pickup_points` плюс
 * заполнение `pickup_point_id` при оформлении заказа; тогда этот файл
 * заменится выборкой.
 */

export const PICKUP_POINT = {
  address: 'г. Алматы, мкр. Шапагат, ул. Амангельды',
  hours: 'ежедневно 10:00–20:00',
} as const

/** Способ доставки заказа в том виде, в каком его хранит база. */
export type DeliveryMethod = 'courier' | 'pickup' | string | null | undefined

export function isPickup(method: DeliveryMethod): boolean {
  return method === 'pickup'
}

/**
 * Подписи шага «заказ уехал со склада».
 *
 * Один и тот же статус `shipped` для курьера и самовывоза значит разное, а
 * текст был написан только под курьера: покупатель, выбравший самовывоз,
 * получал «🚚 Ваш заказ в пути! Заказ передан курьеру и уже едет к вам». Он
 * никуда не поедет — он будет ждать курьера, которого нет. На проде это
 * касалось 42 заказов из 45.
 */
export function shippedWording(method: DeliveryMethod) {
  if (isPickup(method)) {
    return {
      /** Кнопка у менеджера. */
      button: '📦 Готов к выдаче',
      /** Заголовок в админском чате. */
      adminTitle: 'ГОТОВ К ВЫДАЧЕ',
      adminNote: 'Заказ собран и ждёт покупателя в пункте выдачи',
      /** Уведомление покупателю. */
      customerTitle: '📦 Заказ готов к выдаче!',
      customerBody: (orderNo: string) =>
        `Заказ №${orderNo} собран и ждёт вас.\n\n`
        + `📍 ${PICKUP_POINT.address}\n`
        + `🕙 ${PICKUP_POINT.hours}`,
    }
  }

  return {
    button: '🚚 Передать курьеру',
    adminTitle: 'ПЕРЕДАН КУРЬЕРУ',
    adminNote: 'Заказ передан курьеру и в пути',
    customerTitle: '🚚 Ваш заказ в пути!',
    customerBody: (orderNo: string) =>
      `Заказ №${orderNo} передан курьеру и уже едет к вам 🎉`,
  }
}

/** Подписи последнего шага: курьер довёз или покупатель забрал. */
export function deliveredWording(method: DeliveryMethod) {
  if (isPickup(method)) {
    return {
      button: '✅ Выдан покупателю',
      adminTitle: 'ВЫДАН',
      customerTitle: '✅ Спасибо за покупку!',
      customerBody: (orderNo: string) =>
        `Заказ №${orderNo} выдан. Спасибо, что выбрали Ухтышку!`,
    }
  }

  return {
    button: '✅ Доставлен',
    adminTitle: 'ДОСТАВЛЕН',
    customerTitle: '✅ Заказ доставлен!',
    customerBody: (orderNo: string) =>
      `Заказ №${orderNo} доставлен. Спасибо, что выбрали Ухтышку!`,
  }
}


/** Заказ в том виде, в каком его нужно знать курьеру. */
export interface CourierOrder {
  id: string
  final_amount: number | string | null
  payment_method?: string | null
  delivery_address?: { city?: string; line1?: string } | null
  delivery_date?: string | null
  delivery_slot?: string | null
  customer_name?: string | null
  customer_phone?: string | null
  guest_name?: string | null
  guest_phone?: string | null
  comment?: string | null
}

/**
 * Сообщение курьеру: адрес, время, телефон, сумма — и ничего лишнего.
 *
 * Владелец выбрал именно такой состав. Курьеру не нужны ни отмены, ни бонусы,
 * ни чужие заказы: он везёт коробку по адресу и берёт деньги, если оплата
 * наличными. Состав заказа сюда тоже не идёт — вскрывать коробку по дороге
 * незачем, а лишние данные о покупателе лучше не разносить.
 */
const MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
]

/**
 * «2026-09-04» → «4 сентября». Курьер читает это на ходу, и сырая дата из
 * базы тут лишняя работа для глаз. Нераспознанное значение отдаём как есть:
 * лучше показать строку из базы, чем потерять день доставки.
 */
function formatDeliveryDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (!match)
    return value
  const [, , month, day] = match
  const name = MONTHS[Number(month) - 1]
  return name ? `${Number(day)} ${name}` : value
}

/** Сумма с пробелами между тысячами: «16 480 ₸». */
function money(value: number | string | null | undefined): string {
  const n = Math.round(Number(value ?? 0))
  if (!Number.isFinite(n))
    return '0 ₸'
  return `${n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`
}

export function courierMessage(order: CourierOrder): string {
  const address = [order.delivery_address?.city, order.delivery_address?.line1]
    .filter(Boolean)
    .join(', ')

  const when = [
    order.delivery_date ? formatDeliveryDate(order.delivery_date) : null,
    order.delivery_slot,
  ].filter(Boolean).join(', ')
  const phone = order.customer_phone || order.guest_phone || null
  const name = (order.customer_name || order.guest_name || '').trim()

  // Сумму показываем только при оплате наличными: при оплате картой её уже
  // забрали, и цифра в руках курьера только путает.
  const cash = !order.payment_method || order.payment_method === 'cash'

  const lines = [
    `*Доставка №${order.id.slice(-6)}*`,
    '',
    address ? `📍 ${address}` : '📍 адрес не указан',
  ]

  if (when)
    lines.push(`🕒 ${when}`)
  if (name)
    lines.push(`👤 ${name}`)
  if (phone)
    lines.push(`📞 ${phone}`)
  if (cash)
    lines.push(`💵 к оплате: ${money(order.final_amount)}`)
  else
    lines.push('💳 оплачено картой')
  if (order.comment)
    lines.push(`💬 ${order.comment}`)

  return lines.join('\n')
}
