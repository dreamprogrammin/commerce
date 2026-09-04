/**
 * Предложение доставки курьерам — в личку, а не в общий чат.
 *
 * ЗАЧЕМ. Курьерский чат заводился ради того, чтобы курьер не видел кухню
 * магазина: отмены, бонусы, переписку менеджеров. Но чужие доставки он в нём
 * видит — при двух курьерах каждый читает адреса, телефоны и суммы другого.
 * Владелец это заметил, и доставки переехали в личные сообщения.
 *
 * КАК ЭТО РАБОТАЕТ. Заказ переводят в «Передан курьеру» → предложение уходит
 * всем принятым курьерам сразу. Кто первым нажал «Беру», за тем заказ и
 * закрепляется: ему приходят полные данные, у остальных предложение гаснет.
 * Выбирать курьера вручную менеджер не должен — при одном-двух курьерах это
 * лишний шаг на каждом заказе.
 *
 * ЧТО ВИДНО ДО «БЕРУ». Адрес, время и сумма — этого хватает, чтобы решить,
 * берёшь ли ты доставку. Телефон и имя покупателя приходят только тому, кто
 * взял: рассылать контакты покупателя всем, кто мимо, незачем.
 */

import { type CourierOrder, courierMessage } from './shopInfo.ts'
import { buildCallbackData, tableToCode } from './orderActions.ts'

/** Принятый курьер: кому вообще можно предлагать доставку. */
export interface Courier {
  id: string
  telegram_user_id: number
  full_name: string | null
}

/**
 * Курьеры, прошедшие анкету и одобренные владельцем. Черновики и заявки на
 * рассмотрении сюда не попадают: человек, которого ещё не приняли, не должен
 * получать адреса покупателей.
 */
export async function approvedCouriers(supabase: {
  from: (table: string) => any
}): Promise<Courier[]> {
  const { data } = await supabase
    .from('staff')
    .select('id, telegram_user_id, full_name')
    .eq('role', 'courier')
    .eq('status', 'approved')

  return (data ?? []).filter((c: Courier) => !!c.telegram_user_id)
}

/** Имя для чата: «Данияр Ким» или, если анкета без имени, «курьер». */
export function courierLabel(courier: { full_name?: string | null }): string {
  return (courier.full_name || '').trim() || 'курьер'
}

/**
 * Предложение: куда и когда везти. Без телефона и имени покупателя — их
 * получит только тот, кто возьмёт заказ.
 */
export function offerText(order: CourierOrder): string {
  return courierMessage({ ...order, customer_phone: null, guest_phone: null, customer_name: null, guest_name: null })
    .replace(`*Доставка №${order.id.slice(-6)}*`, `*Новая доставка №${order.id.slice(-6)}*`)
    + '\n\nНажмите «Беру», если сможете отвезти.'
}

/** Тому, кто взял: то же самое плюс контакты покупателя. */
export function assignedText(order: CourierOrder): string {
  return `${courierMessage(order)}\n\n_Заказ за вами._`
}

/**
 * Остальным курьерам вместо предложения. Адрес убираем: доставка не их, и
 * данные покупателя в чужой переписке остаются висеть.
 */
export function takenByText(order: CourierOrder, courierName: string): string {
  return `Доставку №${order.id.slice(-6)} взял ${courierName}.`
}

export function offerKeyboard(table: string, orderId: string) {
  return {
    inline_keyboard: [[
      { text: '🚗 Беру', callback_data: buildCallbackData('tak', table, orderId) },
    ]],
  }
}

export function deliveredKeyboard(table: string, orderId: string) {
  return {
    inline_keyboard: [[
      { text: '✅ Доставил', callback_data: buildCallbackData('dlv', table, orderId) },
    ]],
  }
}

/** Куда писать менеджерам, что доставку забрали. */
export function managerNoticeText(order: CourierOrder, courierName: string): string {
  return `🚗 Доставку №${order.id.slice(-6)} везёт ${courierName}`
}

/** Для журнала: `tak:o:<uuid>` читается в логах как есть. */
export function offerLogLine(table: string, orderId: string, sent: number): string {
  return `🚗 предложение ${tableToCode(table)}:${orderId.slice(-6)} → курьеров: ${sent}`
}

/** База Telegram API — подменяется макетом в локальных проверках. */
function apiBase(): string {
  return Deno.env.get('TELEGRAM_API_BASE') ?? 'https://api.telegram.org'
}

/** Чем предложение заканчивается для курьера. */
export function courierClosedText(orderId: string, status: string): string {
  return status === 'delivered'
    ? `✅ Доставка №${orderId.slice(-6)} завершена. Спасибо!`
    : `❌ Доставка №${orderId.slice(-6)} отменена.`
}

/**
 * Гасит предложения в личке курьеров, когда с заказом всё кончено — доставлен
 * или отменён.
 *
 * ЗАЧЕМ. Курьер нажимал «Доставил», заказ закрывался, а кнопка под сообщением
 * оставалась живой: жать её можно было и дальше (владелец заметил это
 * 4 сентября 2026). Хуже того, при отмене уже отгруженного заказа у всех, кто
 * ещё не ответил, продолжала висеть кнопка «Беру» — доставки, которой нет.
 *
 * КОГО ПРАВИМ. Если заказ кто-то вёз — только его сообщение: у остальных
 * предложение погасло ещё в момент «Беру», и второй правкой мы бы им сообщали
 * о судьбе чужой доставки. Если не вёз никто (отменили до того, как взяли, или
 * менеджер закрыл заказ сам) — гасим все разосланные предложения.
 *
 * Возвращает число поправленных сообщений — для журнала.
 */
export async function closeCourierOffers(
  botToken: string,
  supabase: { from: (table: string) => any },
  table: string,
  orderId: string,
  status: string,
): Promise<number> {
  const { data: offers } = await supabase
    .from('courier_offers')
    .select('telegram_user_id, message_id')
    .eq('order_id', orderId)

  const rows = (offers ?? []) as Array<{ telegram_user_id: number; message_id: number }>
  if (rows.length === 0)
    return 0

  const { data: order } = await supabase
    .from(table)
    .select('courier_staff_id')
    .eq('id', orderId)
    .maybeSingle()

  const staffId = (order as { courier_staff_id?: string | null } | null)?.courier_staff_id ?? null
  let holder: number | null = null
  if (staffId) {
    const { data: staff } = await supabase
      .from('staff')
      .select('telegram_user_id')
      .eq('id', staffId)
      .maybeSingle()
    holder = (staff as { telegram_user_id?: number } | null)?.telegram_user_id ?? null
  }

  const text = courierClosedText(orderId, status)
  let closed = 0

  for (const offer of rows) {
    if (holder && String(offer.telegram_user_id) !== String(holder))
      continue

    const res = await fetch(`${apiBase()}/bot${botToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // reply_markup не передаём вовсе: без него Telegram убирает кнопки, а
      // это здесь и нужно — нажимать больше нечего.
      body: JSON.stringify({
        chat_id: offer.telegram_user_id,
        message_id: offer.message_id,
        text,
        parse_mode: 'Markdown',
      }),
    })
    const result = await res.json()
    // «message is not modified» — не ошибка: на отмену смотрят два триггера
    // сразу, и вторая правка приходит на уже поправленное сообщение.
    if (result.ok || String(result.description).includes('not modified'))
      closed++
    else
      console.error('Не удалось погасить предложение курьеру:', JSON.stringify(result))
  }

  return closed
}
