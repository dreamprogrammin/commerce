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
  const carts = await loadCarts(db)
  const userIds = carts.map(c => c.userId)

  const { data: profiles } = userIds.length
    ? await db.from('profiles').select('id, first_name, last_name, phone').in('id', userIds)
    : { data: [] as { id: string, first_name: string | null, last_name: string | null, phone: string | null }[] }
  const profileById = new Map((profiles ?? []).map(p => [p.id, p]))

  // Email живёт в учётной записи, не в профиле
  const emails = new Map<string, string>()
  await Promise.all(userIds.map(async (id) => {
    const { data } = await db.auth.admin.getUserById(id)
    if (data?.user?.email)
      emails.set(id, data.user.email)
  }))

  return carts.map((cart) => {
    const profile = profileById.get(cart.userId)
    return {
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || null,
      phone: profile?.phone ?? null,
      email: emails.get(cart.userId) ?? null,
      updatedAt: cart.updatedAt,
      total: cart.total,
      items: cart.items.map(i => ({ name: i.name, slug: i.slug, quantity: i.quantity, price: i.price, inStock: i.stock > 0 })),
    }
  })
})
