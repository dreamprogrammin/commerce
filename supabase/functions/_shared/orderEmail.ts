/**
 * Отправка писем о заказе через Resend (29 сентября 2026).
 *
 * Зовётся из notify-order-to-telegram (новый заказ) и
 * sync-order-status-to-telegram (смена статуса) — отдельным блоком, до всей
 * логики Telegram и с перехватом ошибок: сбой почты не должен мешать
 * рабочему чату. Текст и разметка — orderEmailTemplate.ts.
 *
 * Секреты функций: RESEND_API_KEY (ключ только на отправку), по желанию
 * ORDER_EMAIL_FROM. Ключа нет — функция молча выходит.
 */
import type { OrderEmailKind } from './orderEmailTemplate.ts'
import { buildOrderEmail, EMAIL_STATUSES } from './orderEmailTemplate.ts'
import { PICKUP_POINT } from './shopInfo.ts'

// deno-lint-ignore no-explicit-any
type Supabase = any

const SITE = 'https://uhti.kz'
// Адрес и часы — из shopInfo.ts, зеркала `constants/shop.ts`; телефон — оттуда же
// на сайте (`SHOP.phoneHuman`), в shopInfo его нет
const SHOP = {
  phoneHuman: '+7 (702) 537-94-73',
  phoneHref: 'tel:+77025379473',
  address: PICKUP_POINT.address,
  hours: PICKUP_POINT.hours,
}

export async function sendOrderEmail(
  supabase: Supabase,
  table: 'orders' | 'guest_checkouts',
  orderId: string,
  kind: OrderEmailKind,
): Promise<string> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey)
    return 'нет RESEND_API_KEY — письмо не отправлялось'
  if (kind !== 'created' && !EMAIL_STATUSES.includes(kind))
    return `статус ${kind} — без письма`

  const isGuest = table === 'guest_checkouts'
  const { data: order, error } = await supabase
    .from(table)
    .select(`id, order_number, tracking_code, delivery_method, final_amount, delivery_cost, pickup_point_id, source, ${isGuest ? 'guest_email' : 'user_id, guest_email'}`)
    .eq('id', orderId)
    .maybeSingle()
  if (error || !order)
    return `заказ не найден: ${error?.message ?? orderId}`
  if (order.source === 'offline' || order.source === 'pos')
    return 'оффлайн-продажа — без письма'

  let email: string | null = order.guest_email || null
  if (!email && order.user_id) {
    const { data } = await supabase.auth.admin.getUserById(order.user_id)
    email = data?.user?.email ?? null
  }
  if (!email)
    return 'у заказа нет email'
  if (!order.tracking_code)
    return 'у заказа нет кода отслеживания'

  let items: { name: string, quantity: number, price: number }[] | undefined
  if (kind === 'created') {
    const { data: rows } = isGuest
      ? await supabase.from('guest_checkout_items').select('quantity, price_per_item, products(name)').eq('checkout_id', orderId)
      : await supabase.from('order_items').select('quantity, price_at_purchase, products(name)').eq('order_id', orderId)
    items = (rows ?? []).map((r: { quantity: number, price_per_item?: number, price_at_purchase?: number, products?: { name: string } | null }) => ({
      name: r.products?.name ?? 'Товар',
      quantity: r.quantity,
      price: Number(r.price_per_item ?? r.price_at_purchase ?? 0),
    }))
  }

  let pickup = null
  if (order.pickup_point_id) {
    const { data } = await supabase.from('pickup_points').select('name, address, working_hours').eq('id', order.pickup_point_id).maybeSingle()
    if (data)
      pickup = { name: data.name, address: data.address, hours: data.working_hours }
  }

  const message = buildOrderEmail({
    kind,
    orderNumber: order.order_number ?? '',
    deliveryMethod: order.delivery_method,
    statusUrl: `${SITE}/order/t/${order.tracking_code}`,
    total: Number(order.final_amount ?? 0),
    deliveryCost: Number(order.delivery_cost ?? 0),
    items,
    pickup,
    shop: SHOP,
  })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      // Повтор того же вызова (ретрай вебхука) не отправит письмо дважды
      'Idempotency-Key': `order-${orderId}-${kind}`,
    },
    body: JSON.stringify({
      from: Deno.env.get('ORDER_EMAIL_FROM') || 'Ухтышка <zakaz@uhti.kz>',
      to: [email],
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: 'kind', value: kind }],
      // Склейка в одну переписку — только одинаковой темой. Свой Message-ID
      // Resend не принимает (ставит идентификатор SES), поэтому In-Reply-To
      // на него указывал бы в никуда; для надёжной склейки нужно хранить
      // настоящий message_id первого письма в заказе (см. docs/HANDOFF.md).
    }),
  })
  if (!res.ok)
    return `Resend ответил ${res.status}: ${(await res.text()).slice(0, 200)}`
  return `письмо «${kind}» отправлено`
}
