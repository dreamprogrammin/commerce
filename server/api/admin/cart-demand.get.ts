/**
 * Спрос из корзин для «К закупке»: какие товары лежат в корзинах вошедших
 * покупателей, сколько штук и у кого.
 *
 * Зачем (31 октября 2026). Владелец: «знать, что мои клиенты кладут в
 * корзину, … а потом к закупке». Товар, которого в корзинах больше, чем на
 * складе, — первый кандидат на закупку, даже если до порога остатка далеко.
 * С 31.10.2026 — и корзины гостей (без имени, «Гость»).
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const carts = await loadCarts(db, { guests: true })

  const userIds = carts.map(c => c.userId).filter((id): id is string => Boolean(id))
  const { data: profiles } = userIds.length
    ? await db.from('profiles').select('id, first_name, last_name').in('id', userIds)
    : { data: [] as { id: string, first_name: string | null, last_name: string | null }[] }
  const nameById = new Map((profiles ?? []).map(p => [p.id, [p.first_name, p.last_name].filter(Boolean).join(' ') || null]))

  const byProduct = new Map<string, {
    productId: string
    name: string
    slug: string | null
    price: number
    stock: number
    quantity: number
    /** id — null у гостя */
    customers: { id: string | null, guest: boolean, name: string | null, quantity: number, updatedAt: string }[]
  }>()
  for (const cart of carts) {
    for (const item of cart.items) {
      const row = byProduct.get(item.productId) ?? {
        productId: item.productId,
        name: item.name,
        slug: item.slug,
        price: item.price,
        stock: item.stock,
        quantity: 0,
        customers: [],
      }
      row.quantity += item.quantity
      row.customers.push({
        id: cart.userId,
        guest: !cart.userId,
        name: cart.userId ? nameById.get(cart.userId) ?? null : null,
        quantity: item.quantity,
        updatedAt: cart.updatedAt,
      })
      byProduct.set(item.productId, row)
    }
  }

  // Сначала то, чего не хватит на все корзины, потом по числу покупателей
  return [...byProduct.values()].sort((a, b) =>
    Number(b.quantity > b.stock) - Number(a.quantity > a.stock)
    || b.customers.length - a.customers.length
    || b.quantity - a.quantity)
})
