/**
 * Справка по заказам для менеджера: строка списка и компактная карточка.
 *
 * ЗАЧЕМ. Единственным способом найти заказ была прокрутка чата: карточки
 * приходят лентой и теряются среди переписки. Отсюда команды «активные»,
 * «мои» и поиск по номеру — им и нужны эти два формата.
 *
 * ЭТО НЕ ЗАМЕНА КАРТОЧКЕ ИЗ УВЕДОМЛЕНИЯ. `notify-order-to-telegram` шлёт
 * подробное сообщение с составом заказа и фотографиями — оно приходит один
 * раз и живёт в чате как рабочий документ. Здесь другое назначение: быстрый
 * ответ на «где заказ 5e4fc2», поэтому короче и без картинок. Смысл держать
 * их разными, а не сводить в один формат.
 */

import { escapeMarkdown } from './telegramUtils.ts'

/** Заказ в том виде, в каком его достаточно знать для списка и карточки. */
/** Позиция заказа — то, что менеджер собирает. */
export interface OrderItem {
  name: string
  quantity: number
  price: number | string | null
}

export interface OrderSummary {
  id: string
  status: string
  final_amount: number | string | null
  created_at: string
  customer_name?: string | null
  customer_phone?: string | null
  guest_name?: string | null
  guest_phone?: string | null
  delivery_method?: string | null
  courier_name?: string | null
  delivery_address?: { city?: string; line1?: string } | null
  comment?: string | null
  assigned_admin_name?: string | null
  assigned_admin_username?: string | null
  /** Из какой таблицы заказ: гостевые лежат отдельно. */
  table: string
  /** Состав заказа. У списка его нет — он нужен только в карточке. */
  items?: OrderItem[]
}

/** Короткий номер заказа — последние шесть знаков id, как в чате и на сайте. */
export function shortNumber(id: string): string {
  return id.slice(-6)
}

const STATUS_LABEL: Record<string, string> = {
  new: '🆕 новый',
  pending: '🆕 новый',
  processing: '⚙️ в работе',
  confirmed: '✅ подтверждён',
  shipped: '🚚 в пути',
  delivered: '📦 доставлен',
  completed: '📦 доставлен',
  cancelled: '❌ отменён',
}

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status
}

/** Статусы, которые ещё требуют внимания менеджера. */
export const ACTIVE_STATUSES = ['new', 'pending', 'processing', 'confirmed', 'shipped']

export function customerName(order: OrderSummary): string {
  return (order.customer_name || order.guest_name || 'Покупатель').trim()
}

export function customerPhone(order: OrderSummary): string | null {
  return order.customer_phone || order.guest_phone || null
}

/** Сумма без копеек: «12 400 ₸». Хвост `.00` в списке только мешает. */
export function formatAmount(value: number | string | null): string {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n))
    return '0 ₸'
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} ₸`
}

/**
 * Сколько прошло с оформления. Менеджеру важнее «2 часа назад», чем точная
 * дата: по этому он решает, чем заняться первым.
 */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000)
  if (!Number.isFinite(minutes) || minutes < 0)
    return 'только что'
  if (minutes < 1)
    return 'только что'
  if (minutes < 60)
    return `${minutes} мин назад`

  const hours = Math.floor(minutes / 60)
  if (hours < 24)
    return `${hours} ч назад`

  const days = Math.floor(hours / 24)
  return days === 1 ? 'вчера' : `${days} дн назад`
}

/** Кто ведёт заказ — с ником, чтобы человека можно было позвать прямо в чате. */
export function assignedTo(order: OrderSummary): string {
  if (!order.assigned_admin_name)
    return 'никто не взял'
  return order.assigned_admin_username
    ? `${order.assigned_admin_name} (@${order.assigned_admin_username})`
    : order.assigned_admin_name
}

/**
 * Строка списка. Номер моноширинным — по нему потом ищут: в Telegram такой
 * текст копируется одним касанием.
 */
export function orderListLine(order: OrderSummary, now?: Date): string {
  const parts = [
    `\`${shortNumber(order.id)}\``,
    statusLabel(order.status),
    formatAmount(order.final_amount),
    escapeMarkdown(customerName(order)),
    timeAgo(order.created_at, now),
  ]
  const line = parts.join(' · ')
  const who = order.assigned_admin_name
    ? `\n   ${escapeMarkdown(assignedTo(order))}`
    : ''
  return line + who
}

export function orderListMessage(
  orders: OrderSummary[],
  title: string,
  emptyText: string,
  now?: Date,
): string {
  if (orders.length === 0)
    return `*${title}*\n\n${emptyText}`

  const lines = orders.map(o => orderListLine(o, now)).join('\n')
  return `*${title}* — ${orders.length}\n\n${lines}\n\n_Карточка заказа: /order номер_`
}

/** Компактная карточка одного заказа — ответ на «где заказ 5e4fc2». */
export function orderCardMessage(order: OrderSummary, now?: Date): string {
  const lines = [
    `*Заказ №${shortNumber(order.id)}* — ${statusLabel(order.status)}`,
    '',
    `*Сумма:* ${formatAmount(order.final_amount)}`,
    `*Покупатель:* ${escapeMarkdown(customerName(order))}`,
  ]

  const phone = customerPhone(order)
  if (phone)
    lines.push(`*Телефон:* ${escapeMarkdown(phone)}`)

  lines.push(
    `*Доставка:* ${order.delivery_method === 'pickup' ? 'самовывоз' : 'курьер'}`,
  )

  if (order.delivery_method !== 'pickup' && order.delivery_address) {
    const address = [order.delivery_address.city, order.delivery_address.line1]
      .filter(Boolean)
      .join(', ')
    if (address)
      lines.push(`*Адрес:* ${escapeMarkdown(address)}`)
  }

  /*
   * Кто повёз. Раньше «передан курьеру» был статусом без человека, и на
   * вопрос «у кого заказ?» отвечали голосом в чате. Имя появляется, как
   * только курьер нажал «Беру» у себя в личке.
   */
  if (order.courier_name)
    lines.push(`*Везёт:* ${escapeMarkdown(order.courier_name)}`)

  if (order.comment)
    lines.push(`*Комментарий:* ${escapeMarkdown(order.comment)}`)

  /*
   * Состав заказа — то, ради чего карточку чаще всего и открывают: по нему
   * собирают коробку. Без него менеджеру пришлось бы искать в ленте исходное
   * уведомление, а это ровно та прокрутка чата, от которой уходили.
   *
   * Больше десяти позиций не печатаем: сообщение Telegram обрежет на 4096
   * знаках, и лучше честный хвост «и ещё N», чем обрубок посреди строки.
   */
  if (order.items?.length) {
    lines.push('', '*Состав:*')
    for (const item of order.items.slice(0, 10)) {
      const sum = formatAmount(Number(item.price ?? 0) * item.quantity)
      lines.push(`• ${escapeMarkdown(item.name)} × ${item.quantity} — ${sum}`)
    }
    if (order.items.length > 10)
      lines.push(`_…и ещё ${order.items.length - 10}_`)
  }

  lines.push(
    '',
    `*Ведёт:* ${escapeMarkdown(assignedTo(order))}`,
    `_Оформлен ${timeAgo(order.created_at, now)}_`,
  )

  if (order.table === 'guest_checkouts')
    lines.push('_Заказ без регистрации_')

  return lines.join('\n')
}
