/**
 * Сводка по покупателям для страницы «Пользователи» в админке.
 *
 * Зачем (30 октября 2026). Владелец хотел видеть покупателей и их заказы
 * в одном месте и находить человека по телефону. Телефон в базе записан
 * как попало: «+7 (777) 123-45-67», «87771234567», «7771234567» — сравнивать
 * его можно только по цифрам.
 */

/** Телефон Казахстана к виду `7XXXXXXXXXX`; пустой или непохожий — `null`. */
export function normalizePhone(phone: string | null | undefined): string | null {
  let digits = (phone ?? '').replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('8'))
    digits = `7${digits.slice(1)}`
  if (digits.length === 10)
    digits = `7${digits}`
  return digits.length === 11 && digits.startsWith('7') ? digits : null
}

export interface OrderForSummary {
  user_id: string | null
  status: string
  final_amount: number | string | null
  created_at: string
}

export interface UserOrderSummary {
  /** Заказов без отменённых */
  orders: number
  cancelled: number
  /** Сумма выполненных — доставленных и завершённых */
  spent: number
  lastOrderAt: string | null
}

/** Статусы, после которых деньги точно получены. */
export const PAID_STATUSES = ['delivered', 'completed']

export function summarizeOrders(orders: OrderForSummary[]): Map<string, UserOrderSummary> {
  const byUser = new Map<string, UserOrderSummary>()
  for (const order of orders) {
    if (!order.user_id)
      continue
    const summary = byUser.get(order.user_id) ?? { orders: 0, cancelled: 0, spent: 0, lastOrderAt: null }
    if (order.status === 'cancelled') {
      summary.cancelled++
    }
    else {
      summary.orders++
      if (PAID_STATUSES.includes(order.status))
        summary.spent += Number(order.final_amount ?? 0)
    }
    if (!summary.lastOrderAt || order.created_at > summary.lastOrderAt)
      summary.lastOrderAt = order.created_at
    byUser.set(order.user_id, summary)
  }
  return byUser
}

/** Поиск по имени, телефону (любой записи) и email. */
export function matchesUserQuery(
  user: { name: string | null, phone: string | null, email: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase()
  if (!q)
    return true
  const qDigits = q.replace(/\D/g, '')
  if (qDigits.length >= 3 && qDigits.length === q.replace(/[\s()+-]/g, '').length) {
    const userPhone = normalizePhone(user.phone) ?? (user.phone ?? '').replace(/\D/g, '')
    // «8 777…» и «+7 777…» — один номер: ведущую восьмёрку читаем как семёрку
    const variants = qDigits.startsWith('8') ? [qDigits, `7${qDigits.slice(1)}`] : [qDigits]
    return variants.some(v => userPhone.includes(v))
  }
  return [user.name, user.email].some(v => v?.toLowerCase().includes(q))
}
