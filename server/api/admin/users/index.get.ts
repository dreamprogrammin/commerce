import { normalizePhone, summarizeOrders } from '~/utils/adminUsers'

/**
 * Список покупателей для админки: профиль, email, бонусы и сводка заказов.
 *
 * Зачем (30 октября 2026). Страница «Пользователи» была пустой заготовкой,
 * а владелец хотел видеть покупателей и их заказы в одном месте.
 *
 * Профили и заказы админу RLS читать даёт, а историю бонусов — нет, и email
 * живёт в учётной записи, не в профиле. Поэтому всё одним маршрутом через
 * ключ сервиса и только после проверки, что спрашивает администратор.
 *
 * Карточки магазина (касса, без аккаунта) идут тем же списком с `kind:
 * 'offline'`. У аккаунта, чей телефон совпал с живой карточкой, —
 * `offlineMatch`: владелец решает, объединять ли (телефон в профиле никто
 * не подтверждает, поэтому не автоматически).
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)

  const [{ data: profiles, error }, { data: orders }, { data: auth }, { data: cards, error: cardsError }] = await Promise.all([
    db.from('profiles')
      .select('id, first_name, last_name, phone, role, created_at, active_bonus_balance, pending_bonus_balance')
      .order('created_at', { ascending: false }),
    db.from('orders').select('user_id, offline_customer_id, status, final_amount, created_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
    db.from('offline_customers')
      .select('id, first_name, last_name, phone, phone_digits, created_at, active_bonus_balance, pending_bonus_balance')
      .is('merged_at', null)
      .order('created_at', { ascending: false }),
  ])
  if (error || cardsError)
    throw createError({ statusCode: 500, message: (error ?? cardsError)!.message })

  const emails = new Map((auth?.users ?? []).map(u => [u.id, u.email ?? null]))
  const summaries = summarizeOrders(orders ?? [])
  // Заказ карточки до слияния — без user_id, считаем по карточке
  const cardSummaries = summarizeOrders((orders ?? [])
    .filter(o => !o.user_id && o.offline_customer_id)
    .map(o => ({ ...o, user_id: o.offline_customer_id })))
  // Корзины — чтобы в списке было видно, у кого что лежит неоформленным
  const cartByUser = new Map((await loadCarts(db)).map(c => [c.userId!, c]))
  const cardByPhone = new Map((cards ?? []).map(c => [c.phone_digits, c]))
  const empty = { orders: 0, cancelled: 0, spent: 0, lastOrderAt: null }

  const offline = (cards ?? []).map(c => ({
    id: c.id,
    kind: 'offline' as const,
    name: [c.first_name, c.last_name].filter(Boolean).join(' ') || null,
    phone: c.phone,
    email: null,
    role: 'user',
    createdAt: c.created_at,
    activeBonuses: c.active_bonus_balance,
    pendingBonuses: c.pending_bonus_balance,
    offlineMatch: null,
    cart: null,
    ...(cardSummaries.get(c.id) ?? empty),
  }))

  const accounts = (profiles ?? []).map((p) => {
    const card = cardByPhone.get(normalizePhone(p.phone) ?? '')
    return {
      id: p.id,
      kind: 'account' as const,
      name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
      phone: p.phone,
      email: emails.get(p.id) ?? null,
      role: p.role,
      createdAt: p.created_at,
      activeBonuses: p.active_bonus_balance ?? 0,
      pendingBonuses: p.pending_bonus_balance ?? 0,
      offlineMatch: card ? { id: card.id, name: [card.first_name, card.last_name].filter(Boolean).join(' ') } : null,
      cart: cartByUser.has(p.id)
        ? { quantity: cartByUser.get(p.id)!.quantity, total: cartByUser.get(p.id)!.total, updatedAt: cartByUser.get(p.id)!.updatedAt }
        : null,
      ...(summaries.get(p.id) ?? empty),
    }
  })

  return [...accounts, ...offline]
})
