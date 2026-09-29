/**
 * Статус заказа по коду отслеживания — для страницы `/order/t/<код>`.
 *
 * Зачем (29 сентября 2026). Гость, уйдя со страницы «Заказ оформлен», свой
 * заказ больше не видел: `guest_checkouts` RLS отдаёт только
 * администраторам, а кнопкой «Следить в Telegram» не подписался ни один из
 * 15 гостевых заказов. Код отслеживания у каждого заказа уже есть (12
 * шестнадцатеричных знаков, `tracking_code`, миграция 20260907100000) —
 * подобрать его перебором нереально, так что ссылка с ним и есть доступ.
 *
 * Отдаём только то, что нужно для статуса: без имени, телефона и email —
 * если ссылка уйдёт постороннему, контактов он не получит. Читается ключом
 * сервиса: RLS гостю свой заказ не отдаёт.
 */
interface ItemRow { product_id: string, quantity: number, price_per_item?: number, price_at_purchase?: number }

export default defineEventHandler(async (event) => {
  const code = String(getRouterParam(event, 'code') ?? '').toLowerCase()
  if (!/^[0-9a-f]{12}$/.test(code))
    throw createError({ statusCode: 404, message: 'Заказ не найден' })

  // Статус должен быть свежим: ни браузер, ни CDN ответ не держат
  setResponseHeader(event, 'Cache-Control', 'no-store')

  const db = serviceSupabase()
  const columns = 'id, order_number, status, created_at, final_amount, delivery_cost, delivery_method, payment_method, delivery_address, delivery_date, delivery_slot, pickup_point_id'

  let kind: 'guest' | 'user' = 'guest'
  let { data: order } = await db.from('guest_checkouts').select(columns).eq('tracking_code', code).maybeSingle()
  if (!order) {
    kind = 'user'
    ;({ data: order } = await db.from('orders').select(columns).eq('tracking_code', code).maybeSingle())
  }
  if (!order)
    throw createError({ statusCode: 404, message: 'Заказ не найден' })

  const [{ data: items }, { data: pickup }] = await Promise.all([
    kind === 'guest'
      ? db.from('guest_checkout_items').select('product_id, quantity, price_per_item').eq('checkout_id', order.id)
      : db.from('order_items').select('product_id, quantity, price_at_purchase').eq('order_id', order.id),
    order.pickup_point_id
      ? db.from('pickup_points').select('name, address, working_hours, phone').eq('id', order.pickup_point_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const rows = (items ?? []) as ItemRow[]
  const { data: products } = rows.length
    ? await db.from('products').select('id, name, slug, product_images(image_url, display_order)').in('id', rows.map(r => r.product_id))
    : { data: [] as { id: string, name: string, slug: string, product_images: { image_url: string, display_order: number | null }[] }[] }
  const productById = new Map((products ?? []).map(p => [p.id, p]))

  return {
    orderNumber: order.order_number,
    status: order.status,
    createdAt: order.created_at,
    total: Number(order.final_amount ?? 0),
    deliveryCost: Number(order.delivery_cost ?? 0),
    deliveryMethod: order.delivery_method,
    paymentMethod: order.payment_method,
    deliveryAddress: order.delivery_address,
    deliveryDate: order.delivery_date,
    deliverySlot: order.delivery_slot,
    pickupPoint: pickup,
    items: rows.map((row) => {
      const product = productById.get(row.product_id)
      const image = [...(product?.product_images ?? [])].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]?.image_url ?? null
      return {
        name: product?.name ?? 'Товар',
        slug: product?.slug ?? null,
        image,
        quantity: row.quantity,
        price: Number(row.price_per_item ?? row.price_at_purchase ?? 0),
      }
    }),
  }
})
