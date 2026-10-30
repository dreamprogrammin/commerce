import { summarizeOrders } from '~/utils/adminUsers'

/**
 * Список покупателей для админки: профиль, email, бонусы и сводка заказов.
 *
 * Зачем (30 октября 2026). Страница «Пользователи» была пустой заготовкой,
 * а владелец хотел видеть покупателей и их заказы в одном месте.
 *
 * Профили и заказы админу RLS читать даёт, а историю бонусов — нет, и email
 * живёт в учётной записи, не в профиле. Поэтому всё одним маршрутом через
 * ключ сервиса и только после проверки, что спрашивает администратор.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)

  const [{ data: profiles, error }, { data: orders }, { data: auth }] = await Promise.all([
    db.from('profiles')
      .select('id, first_name, last_name, phone, role, created_at, active_bonus_balance, pending_bonus_balance')
      .order('created_at', { ascending: false }),
    db.from('orders').select('user_id, status, final_amount, created_at'),
    db.auth.admin.listUsers({ perPage: 1000 }),
  ])
  if (error)
    throw createError({ statusCode: 500, message: error.message })

  const emails = new Map((auth?.users ?? []).map(u => [u.id, u.email ?? null]))
  const summaries = summarizeOrders(orders ?? [])

  return (profiles ?? []).map(p => ({
    id: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(' ') || null,
    phone: p.phone,
    email: emails.get(p.id) ?? null,
    role: p.role,
    createdAt: p.created_at,
    activeBonuses: p.active_bonus_balance ?? 0,
    pendingBonuses: p.pending_bonus_balance ?? 0,
    ...(summaries.get(p.id) ?? { orders: 0, cancelled: 0, spent: 0, lastOrderAt: null }),
  }))
})
