import { summarizeOrders } from '~/utils/adminUsers'

/**
 * Карточка покупателя для админки: профиль, все заказы с составом
 * (с сайта и из кассы) и история бонусов.
 *
 * Историю бонусов чужого человека RLS админу не отдаёт — читаем ключом
 * сервиса после `requireAdmin`. У операции бонусов владелец записан в двух
 * колонках (`user_id` и `profile_id`), смотрим обе.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    throw createError({ statusCode: 400, message: 'Неверный id' })

  const [{ data: profile }, { data: orders, error: ordersError }, { data: bonuses }, { data: auth }] = await Promise.all([
    db.from('profiles')
      .select('id, first_name, last_name, phone, role, created_at, active_bonus_balance, pending_bonus_balance')
      .eq('id', id)
      .maybeSingle(),
    db.from('orders')
      .select('id, order_number, created_at, status, source, final_amount, bonuses_spent, bonuses_awarded, delivery_method, payment_method')
      .eq('user_id', id)
      .order('created_at', { ascending: false }),
    db.from('bonus_transactions')
      .select('id, created_at, transaction_type, amount, balance_after, status, description, order_id, activation_date, metadata')
      .or(`user_id.eq.${id},profile_id.eq.${id}`)
      .order('created_at', { ascending: false }),
    db.auth.admin.getUserById(id),
  ])
  if (!profile)
    throw createError({ statusCode: 404, message: 'Пользователь не найден' })
  if (ordersError)
    throw createError({ statusCode: 500, message: ordersError.message })

  const orderIds = (orders ?? []).map(o => o.id)
  const { data: items } = orderIds.length
    ? await db.from('order_items').select('order_id, product_id, quantity, price_at_purchase').in('order_id', orderIds)
    : { data: [] as { order_id: string, product_id: string, quantity: number, price_at_purchase: number }[] }
  const productIds = [...new Set((items ?? []).map(i => i.product_id).filter(Boolean))]
  const { data: products } = productIds.length
    ? await db.from('products').select('id, name, slug').in('id', productIds)
    : { data: [] as { id: string, name: string, slug: string }[] }
  const productById = new Map((products ?? []).map(p => [p.id, p]))

  return {
    id: profile.id,
    name: [profile.first_name, profile.last_name].filter(Boolean).join(' ') || null,
    phone: profile.phone,
    email: auth?.user?.email ?? null,
    role: profile.role,
    createdAt: profile.created_at,
    activeBonuses: profile.active_bonus_balance ?? 0,
    pendingBonuses: profile.pending_bonus_balance ?? 0,
    summary: summarizeOrders((orders ?? []).map(o => ({ ...o, user_id: id }))).get(id)
      ?? { orders: 0, cancelled: 0, spent: 0, lastOrderAt: null },
    orders: (orders ?? []).map(o => ({
      id: o.id,
      number: o.order_number,
      createdAt: o.created_at,
      status: o.status,
      source: o.source,
      total: Number(o.final_amount ?? 0),
      bonusesSpent: o.bonuses_spent ?? 0,
      bonusesAwarded: o.bonuses_awarded ?? 0,
      deliveryMethod: o.delivery_method,
      paymentMethod: o.payment_method,
      items: (items ?? []).filter(i => i.order_id === o.id).map(i => ({
        name: productById.get(i.product_id)?.name ?? 'Товар удалён',
        slug: productById.get(i.product_id)?.slug ?? null,
        quantity: i.quantity,
        price: Number(i.price_at_purchase ?? 0),
      })),
    })),
    bonuses: (bonuses ?? []).map(b => ({
      id: b.id,
      createdAt: b.created_at,
      type: b.transaction_type,
      amount: b.amount,
      balanceAfter: b.balance_after,
      status: b.status,
      description: b.description,
      orderId: b.order_id,
      activationDate: b.activation_date,
      // Ручное начисление: кто начислил (admin_add_bonus пишет в metadata)
      by: (b.metadata as { admin_name?: string } | null)?.admin_name ?? null,
    })),
  }
})
