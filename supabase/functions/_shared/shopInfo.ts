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
