/**
 * Брошенные корзины вошедших покупателей — для админки.
 *
 * Зачем (29 сентября 2026). Владелец хотел видеть, кто добавлял товар в
 * корзину. Google Analytics этого не скажет — она обезличена. А корзина
 * вошедшего покупателя лежит в `server_carts` с его `user_id`: отсюда имя,
 * телефон и email. У гостей корзина только в их браузере — их здесь нет.
 *
 * Корзина очищается при оформлении, так что непустая — ещё не заказанная.
 * Читать `server_carts` чужим пользователям RLS не даёт, поэтому — через
 * ключ сервиса и только после проверки, что спрашивает администратор.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)

  const { data: carts, error } = await db
    .from('server_carts')
    .select('user_id, items, total_amount, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error)
    throw createError({ statusCode: 500, message: error.message })

  const filled = (carts ?? []).filter(c => Array.isArray(c.items) && c.items.length > 0)
  const userIds = filled.map(c => c.user_id)
  const productIds = [...new Set(filled.flatMap(c => (c.items as { product_id: string }[]).map(i => i.product_id)))]

  const [{ data: profiles }, { data: products }] = await Promise.all([
    userIds.length
      ? db.from('profiles').select('id, first_name, last_name, phone').in('id', userIds)
      : Promise.resolve({ data: [] as { id: string, first_name: string | null, last_name: string | null, phone: string | null }[] }),
    productIds.length
      ? db.from('products').select('id, name, slug, price, final_price, stock_quantity').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string, name: string, slug: string, price: number, final_price: number | null, stock_quantity: number | null }[] }),
  ])
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))
  const productById = new Map((products ?? []).map(p => [p.id, p]))

  // Email живёт в учётной записи, не в профиле
  const emails = new Map<string, string>()
  await Promise.all(userIds.map(async (id) => {
    const { data } = await db.auth.admin.getUserById(id)
    if (data?.user?.email)
      emails.set(id, data.user.email)
  }))

  return filled.map((cart) => {
    const profile = profileById.get(cart.user_id)
    const items = (cart.items as { product_id: string, quantity: number }[]).map((item) => {
      const product = productById.get(item.product_id)
      const price = Number(product?.final_price || product?.price || 0)
      return {
        name: product?.name ?? 'Товар удалён',
        slug: product?.slug ?? null,
        quantity: item.quantity,
        price,
        inStock: (product?.stock_quantity ?? 0) > 0,
      }
    })
    return {
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
      phone: profile?.phone ?? null,
      email: emails.get(cart.user_id) ?? null,
      updatedAt: cart.updated_at,
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      items,
    }
  })
})
