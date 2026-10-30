import { normalizePhone, summarizeOrders } from '~/utils/adminUsers'

/**
 * Карточка покупателя для админки: профиль, все заказы с составом
 * (с сайта и из кассы) и история бонусов.
 *
 * Историю бонусов чужого человека RLS админу не отдаёт — читаем ключом
 * сервиса после `requireAdmin`. У операции бонусов владелец записан в двух
 * колонках (`user_id` и `profile_id`), смотрим обе.
 *
 * `id` бывает и карточкой магазина (`offline_customers`, 30.10.2026): тогда
 * `kind: 'offline'`, заказы и бонусы — по `offline_customer_id`. У аккаунта
 * с тем же телефоном, что у живой карточки, — `offlineMatch` для кнопки
 * «Объединить».
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getRouterParam(event, 'id')
  if (!id || !/^[0-9a-f-]{36}$/i.test(id))
    throw createError({ statusCode: 400, message: 'Неверный id' })

  const [{ data: profile }, { data: card }] = await Promise.all([
    db.from('profiles')
      .select('id, first_name, last_name, phone, role, created_at, active_bonus_balance, pending_bonus_balance')
      .eq('id', id)
      .maybeSingle(),
    db.from('offline_customers')
      .select('id, first_name, last_name, phone, created_at, active_bonus_balance, pending_bonus_balance, merged_into, merged_at')
      .eq('id', id)
      .maybeSingle(),
  ])
  if (!profile && !card)
    throw createError({ statusCode: 404, message: 'Пользователь не найден' })

  const ordersQuery = db.from('orders')
    .select('id, order_number, created_at, status, source, final_amount, bonuses_spent, bonuses_awarded, delivery_method, payment_method, offline_customer_id')
    .order('created_at', { ascending: false })
  const bonusesQuery = db.from('bonus_transactions')
    .select('id, created_at, transaction_type, amount, balance_after, status, description, order_id, activation_date, metadata')
    .order('created_at', { ascending: false })

  const [{ data: orders, error: ordersError }, { data: bonuses }, { data: auth }] = await Promise.all([
    profile ? ordersQuery.eq('user_id', id) : ordersQuery.eq('offline_customer_id', id).is('user_id', null),
    profile ? bonusesQuery.or(`user_id.eq.${id},profile_id.eq.${id}`) : bonusesQuery.eq('offline_customer_id', id).is('user_id', null),
    profile ? db.auth.admin.getUserById(id) : Promise.resolve({ data: null }),
  ])
  if (ordersError)
    throw createError({ statusCode: 500, message: ordersError.message })

  // Аккаунт: живая карточка магазина с тем же телефоном — кандидат на слияние
  const phoneDigits = profile ? normalizePhone(profile.phone) : null
  const { data: match } = phoneDigits
    ? await db.from('offline_customers')
        .select('id, first_name, last_name, phone, active_bonus_balance, pending_bonus_balance')
        .eq('phone_digits', phoneDigits)
        .is('merged_at', null)
        .maybeSingle()
    : { data: null }
  const { count: matchOrders } = match
    ? await db.from('orders').select('id', { count: 'exact', head: true }).eq('offline_customer_id', match.id).is('user_id', null)
    : { count: 0 }
  // Карточка, уже объединённая: куда ушла
  const { data: mergedInto } = card?.merged_into
    ? await db.from('profiles').select('id, first_name, last_name').eq('id', card.merged_into).maybeSingle()
    : { data: null }

  const orderIds = (orders ?? []).map(o => o.id)
  const { data: items } = orderIds.length
    ? await db.from('order_items').select('order_id, product_id, quantity, price_at_purchase').in('order_id', orderIds)
    : { data: [] as { order_id: string, product_id: string, quantity: number, price_at_purchase: number }[] }
  const productIds = [...new Set((items ?? []).map(i => i.product_id).filter(Boolean))]
  const { data: products } = productIds.length
    ? await db.from('products').select('id, name, slug').in('id', productIds)
    : { data: [] as { id: string, name: string, slug: string }[] }
  const productById = new Map((products ?? []).map(p => [p.id, p]))

  // Что лежит в корзине сейчас — только у аккаунта: у карточки магазина корзины нет
  const [cart] = profile ? await loadCarts(db, [id]) : []

  const person = (profile ?? card)!
  const fullName = (p: { first_name: string | null, last_name: string | null }) =>
    [p.first_name, p.last_name].filter(Boolean).join(' ') || null

  return {
    id: person.id,
    kind: profile ? 'account' as const : 'offline' as const,
    name: fullName(person),
    phone: person.phone,
    email: auth?.user?.email ?? null,
    role: profile?.role ?? 'user',
    createdAt: person.created_at,
    activeBonuses: person.active_bonus_balance ?? 0,
    pendingBonuses: person.pending_bonus_balance ?? 0,
    offlineMatch: match
      ? {
          id: match.id,
          name: fullName(match),
          phone: match.phone,
          orders: matchOrders ?? 0,
          activeBonuses: match.active_bonus_balance,
          pendingBonuses: match.pending_bonus_balance,
        }
      : null,
    mergedInto: mergedInto ? { id: mergedInto.id, name: fullName(mergedInto), at: card!.merged_at } : null,
    summary: summarizeOrders((orders ?? []).map(o => ({ ...o, user_id: id }))).get(id)
      ?? { orders: 0, cancelled: 0, spent: 0, lastOrderAt: null },
    orders: (orders ?? []).map(o => ({
      id: o.id,
      number: o.order_number,
      createdAt: o.created_at,
      status: o.status,
      source: o.source,
      // Покупка была на карточку магазина до слияния
      fromCard: Boolean(profile && o.offline_customer_id),
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
    cart: cart ?? null,
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
