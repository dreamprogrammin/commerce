/**
 * Письма покупателю о заказе — текст и разметка (29 сентября 2026).
 *
 * Чистые функции, без Deno и сети: их проверяют тесты сайта (vitest), а
 * отправляет `orderEmail.ts`. Зачем письма: форма оформления обещает «Email
 * для чека и статуса заказа», а писем сайт не слал вовсе; гость, уйдя со
 * страницы «Заказ оформлен», о заказе больше ничего не узнавал. Каждое
 * письмо ведёт на страницу статуса `/order/t/<код>`.
 */

export type OrderEmailKind = 'created' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

/**
 * Статусы, о которых пишем, — только когда покупателю нужно что-то сделать
 * или узнать важное (решение владельца 29 сентября 2026: не спамить на
 * каждую смену). «Подтверждён» — менеджер и так звонит; «доставлен» —
 * человек знает сам. Всё остальное видно по ссылке на странице статуса.
 * Обычный заказ — два письма: «принят» и «готов к выдаче» / «курьер везёт».
 */
export const EMAIL_STATUSES: readonly OrderEmailKind[] = ['shipped', 'cancelled']

/**
 * Одна тема на все письма заказа: по ней почта складывает их в одну цепочку
 * «Заказ №…». Gmail и Mail.ru обычно склеивают письма с одной темой от одного
 * отправителя; гарантия — только с заголовками `References` на настоящий
 * message_id первого письма, а его Resend отдаёт лишь после отправки.
 */
export function orderEmailSubject(orderNumber: number | string): string {
  return `Заказ №${orderNumber} — Ухтышка`
}


export interface OrderEmailData {
  kind: OrderEmailKind
  orderNumber: number | string
  deliveryMethod: string | null
  statusUrl: string
  total: number
  deliveryCost?: number
  items?: { name: string, quantity: number, price: number }[]
  pickup?: { name?: string | null, address?: string | null, hours?: string | null } | null
  shop: { phoneHuman: string, phoneHref: string, address: string, hours: string }
}

const isPickup = (m: string | null) => m === 'pickup'

/** 18480 → «18 480 ₸» с неразрывными пробелами — как на сайте. */
export function tenge(n: number): string {
  return `${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0')}\u00A0₸`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Заголовок письма и абзац под ним — по поводу и способу получения. */
export function orderEmailCopy(d: Pick<OrderEmailData, 'kind' | 'orderNumber' | 'deliveryMethod' | 'pickup' | 'shop'>): { subject: string, heading: string, lead: string } {
  const no = `№${d.orderNumber}`
  const pickup = isPickup(d.deliveryMethod)
  const where = [d.pickup?.name, d.pickup?.address].filter(Boolean).join(', ') || d.shop.address
  const hours = d.pickup?.hours || d.shop.hours
  switch (d.kind) {
    case 'created':
      return {
        subject: orderEmailSubject(d.orderNumber),
        heading: `Спасибо! Заказ ${no} принят`,
        lead: 'Менеджер свяжется с вами, чтобы подтвердить детали. Платить заранее не нужно.',
      }
    case 'confirmed':
      return {
        subject: orderEmailSubject(d.orderNumber),
        heading: `Заказ ${no} подтверждён`,
        lead: pickup ? 'Собираем заказ. Напишем, когда его можно будет забрать.' : 'Собираем заказ и скоро передадим курьеру.',
      }
    case 'shipped':
      return pickup
        ? { subject: orderEmailSubject(d.orderNumber), heading: `Заказ ${no} готов к выдаче`, lead: `Забрать можно здесь: ${where}, ${hours}.` }
        : { subject: orderEmailSubject(d.orderNumber), heading: `Заказ ${no} в пути`, lead: 'Курьер уже везёт заказ. Он позвонит перед приездом.' }
    case 'delivered':
      return pickup
        ? { subject: orderEmailSubject(d.orderNumber), heading: `Заказ ${no} выдан`, lead: 'Спасибо за покупку! Будем рады вашему отзыву о товаре на сайте.' }
        : { subject: orderEmailSubject(d.orderNumber), heading: `Заказ ${no} доставлен`, lead: 'Спасибо за покупку! Будем рады вашему отзыву о товаре на сайте.' }
    case 'cancelled':
      return {
        subject: orderEmailSubject(d.orderNumber),
        heading: `Заказ ${no} отменён`,
        lead: `Если это ошибка или остались вопросы — позвоните нам: ${d.shop.phoneHuman}.`,
      }
  }
}

export function buildOrderEmail(d: OrderEmailData): { subject: string, html: string, text: string } {
  const { subject, heading, lead } = orderEmailCopy(d)
  const items = d.items ?? []
  const rows = items.map(i =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${escapeHtml(i.name)} × ${i.quantity}</td>`
    + `<td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;white-space:nowrap">${tenge(i.price * i.quantity)}</td></tr>`).join('')
  const totals = items.length
    ? `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;margin:16px 0">${rows}`
    + (d.deliveryCost ? `<tr><td style="padding:6px 0;color:#666">Доставка</td><td style="padding:6px 0;text-align:right;color:#666">${tenge(d.deliveryCost)}</td></tr>` : '')
    + `<tr><td style="padding:8px 0;font-weight:700">Итого</td><td style="padding:8px 0;text-align:right;font-weight:700">${tenge(d.total)}</td></tr></table>`
    : ''

  const html = `<!doctype html><html lang="ru"><body style="margin:0;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
<table role="presentation" width="100%" style="background:#f4f6fa;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:28px">
<tr><td>
<div style="font-size:20px;font-weight:800;color:#2563eb;margin-bottom:18px">Ухтышка</div>
<h1 style="font-size:22px;margin:0 0 10px">${escapeHtml(heading)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 18px">${escapeHtml(lead)}</p>
${totals}
<a href="${escapeHtml(d.statusUrl)}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Статус заказа</a>
<p style="font-size:13px;color:#666;line-height:1.5;margin:22px 0 0">Вопросы по заказу — <a href="${escapeHtml(d.shop.phoneHref)}" style="color:#2563eb">${escapeHtml(d.shop.phoneHuman)}</a>, ${escapeHtml(d.shop.hours)}.<br>${escapeHtml(d.shop.address)}.<br>Это автоматическое письмо — отвечать на него не нужно.</p>
</td></tr></table></td></tr></table></body></html>`

  const text = [
    heading,
    '',
    lead,
    ...(items.length ? ['', ...items.map(i => `${i.name} × ${i.quantity} — ${tenge(i.price * i.quantity)}`), ...(d.deliveryCost ? [`Доставка — ${tenge(d.deliveryCost)}`] : []), `Итого — ${tenge(d.total)}`] : []),
    '',
    `Статус заказа: ${d.statusUrl}`,
    '',
    `Вопросы по заказу — ${d.shop.phoneHuman}, ${d.shop.hours}. ${d.shop.address}.`,
  ].join('\n')

  return { subject, html, text }
}
