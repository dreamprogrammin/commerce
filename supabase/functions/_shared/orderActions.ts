/**
 * Кнопки управления заказом в Telegram — один источник на все функции.
 *
 * ЗАЧЕМ ОБЩИЙ ФАЙЛ. Клавиатура собиралась в двух местах отдельно:
 * `notify-order-to-telegram` рисовала её при создании заказа,
 * `sync-order-status-to-telegram` — заново на каждую смену статуса. Двадцать
 * строк почти одинакового кода в каждом; расхождение здесь означает, что у
 * оператора на карточке появляется не та кнопка.
 *
 * ЗАЧЕМ CALLBACK, А НЕ URL. Кнопки были обычными ссылками на эдж-функции, и
 * это стоило трёх вещей сразу (проверено на проде 3 сентября 2026):
 *
 *  1. НЕИЗВЕСТНО, КТО ВЗЯЛ ЗАКАЗ. По ссылке Telegram не сообщает, кто её
 *     нажал, поэтому `assign-order-to-admin` подставляла значение по
 *     умолчанию: у всех 24 взятых в работу заказов стояло «Админ» и пустой
 *     ник. Для чата, где работают несколько менеджеров, это главная беда —
 *     не видно, кто чем занят.
 *  2. ADMIN_SECRET ЛЕЖАЛ ПРЯМО В ССЫЛКЕ. Долгое нажатие на кнопку → «копировать
 *     ссылку» → секрет у любого участника чата, и дальше им можно подтверждать
 *     и отменять заказы с чего угодно. Он же оседал в истории браузера.
 *  3. НАЖАТИЕ УВОДИЛО В БРАУЗЕР — открывалась страница с текстом «✅ ЗАКАЗ
 *     ПОДТВЕРЖДЁН», и надо было возвращаться в чат руками.
 *
 * С `callback_data` бот узнаёт нажавшего (`callback_query.from`), секрет
 * остаётся в окружении функции, а вместо ухода в браузер оператор видит
 * всплывающую плашку, и карточка перерисовывается на месте.
 */

import { type DeliveryMethod, deliveredWording, shippedWording } from './shopInfo.ts'

/** Таблица заказа, ужатая до одной буквы: `callback_data` даётся 64 байта. */
export type OrderTableCode = 'o' | 'g'

export type OrderAction = 'asg' | 'cfm' | 'shp' | 'dlv' | 'cnl'

/** Какую эдж-функцию зовёт каждое действие. */
export const ACTION_FUNCTIONS: Record<OrderAction, string> = {
  asg: 'assign-order-to-admin',
  cfm: 'confirm-order',
  shp: 'ship-order',
  dlv: 'deliver-order',
  cnl: 'cancel-order',
}

export function tableToCode(table: string): OrderTableCode {
  return table === 'guest_checkouts' ? 'g' : 'o'
}

export function codeToTable(code: string): string {
  return code === 'g' ? 'guest_checkouts' : 'orders'
}

/**
 * `<действие>:<таблица>:<id>` — 3 + 1 + 1 + 1 + 36 = 42 байта при UUID,
 * с запасом влезает в лимит Telegram в 64 байта.
 */
export function buildCallbackData(
  action: OrderAction,
  table: string,
  orderId: string,
): string {
  return `${action}:${tableToCode(table)}:${orderId}`
}

export function parseCallbackData(
  data: string,
): { action: OrderAction; table: string; orderId: string } | null {
  const parts = data.split(':')
  if (parts.length !== 3)
    return null

  const [action, tableCode, orderId] = parts
  if (!(action in ACTION_FUNCTIONS))
    return null
  if (!orderId)
    return null

  return {
    action: action as OrderAction,
    table: codeToTable(tableCode),
    orderId,
  }
}

/**
 * Клавиатура под статус заказа. `null` — когда действий не осталось:
 * доставленный и отменённый заказ трогать больше нечем, и кнопка «Отменить»
 * под ними только путала бы.
 */
export function buildOrderKeyboard(
  status: string,
  table: string,
  orderId: string,
  /**
   * Способ доставки: от него зависит подпись шага. «Передать курьеру» на
   * самовывозном заказе — неверная кнопка, а таких заказов на проде 42 из 45.
   */
  deliveryMethod?: DeliveryMethod,
): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } | null {
  const cancel = {
    text: '❌ Отменить',
    callback_data: buildCallbackData('cnl', table, orderId),
  }

  const primary: Partial<Record<string, { text: string; action: OrderAction }>> = {
    new: { text: '✅ Взять в работу', action: 'asg' },
    pending: { text: '✅ Взять в работу', action: 'asg' },
    processing: { text: '✅ Подтвердить', action: 'cfm' },
    confirmed: { text: shippedWording(deliveryMethod).button, action: 'shp' },
    shipped: { text: deliveredWording(deliveryMethod).button, action: 'dlv' },
  }

  const step = primary[status]
  if (!step)
    return null

  return {
    inline_keyboard: [
      [{ text: step.text, callback_data: buildCallbackData(step.action, table, orderId) }],
      [cancel],
    ],
  }
}
