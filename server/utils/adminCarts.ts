import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Корзины покупателей для админки — с названиями, текущими ценами и
 * остатками товаров. Вошедшие — из `server_carts`, гости (с 31.10.2026) — из
 * `guest_carts`: без имени, по случайному номеру браузера.
 *
 * Зачем (31 октября 2026). Владелец хотел видеть, что покупатели кладут в
 * корзину: в карточке покупателя и в «К закупке». Google Analytics этого не
 * скажет — она обезличена. Корзина очищается при оформлении — непустая
 * значит «ещё не заказано».
 *
 * Только с клиентом сервиса после `requireAdmin`: чужие корзины RLS не отдаёт.
 */
export interface AdminCartItem {
  productId: string
  name: string
  slug: string | null
  quantity: number
  price: number
  stock: number
}

export interface AdminCart {
  /** null — гость */
  userId: string | null
  guestId: string | null
  updatedAt: string
  total: number
  quantity: number
  items: AdminCartItem[]
}

/** Гостевые старше — не спрос, а забытая вкладка */
const GUEST_DAYS = 30
/** Больше позиций у гостя — не покупатель, а перебор каталога (бот, тест) */
const GUEST_MAX_ITEMS = 20

export async function loadCarts(db: SupabaseClient, options: { userIds?: string[], guests?: boolean } = {}): Promise<AdminCart[]> {
  let query = db.from('server_carts').select('user_id, items, updated_at').order('updated_at', { ascending: false })
  if (options.userIds)
    query = query.in('user_id', options.userIds)
  const guestQuery = options.guests
    ? db.from('guest_carts').select('id, items, updated_at').gte('updated_at', new Date(Date.now() - GUEST_DAYS * 86400000).toISOString()).order('updated_at', { ascending: false })
    : null
  const [{ data: carts, error }, guestRes] = await Promise.all([query, guestQuery])
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (guestRes?.error)
    throw createError({ statusCode: 500, message: guestRes.error.message })

  const rows = [
    ...(carts ?? []).map(c => ({ userId: c.user_id as string, guestId: null, items: c.items, updatedAt: c.updated_at as string })),
    ...(guestRes?.data ?? [])
      .filter(c => Array.isArray(c.items) && c.items.length <= GUEST_MAX_ITEMS)
      .map(c => ({ userId: null, guestId: c.id as string, items: c.items, updatedAt: c.updated_at as string })),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const filled = rows.filter(c => Array.isArray(c.items) && c.items.length > 0)
  const productIds = [...new Set(filled.flatMap(c => (c.items as { product_id: string }[]).map(i => i.product_id)))]
  const { data: products } = productIds.length
    ? await db.from('products').select('id, name, slug, price, final_price, stock_quantity').in('id', productIds)
    : { data: [] as { id: string, name: string, slug: string, price: number, final_price: number | null, stock_quantity: number | null }[] }
  const productById = new Map((products ?? []).map(p => [p.id, p]))

  return filled.map((cart) => {
    const items = (cart.items as { product_id: string, quantity: number }[]).map((item) => {
      const product = productById.get(item.product_id)
      return {
        productId: item.product_id,
        name: product?.name?.trim() ?? 'Товар удалён',
        slug: product?.slug ?? null,
        quantity: item.quantity,
        price: Number(product?.final_price || product?.price || 0),
        stock: product?.stock_quantity ?? 0,
      }
    })
    return {
      userId: cart.userId,
      guestId: cart.guestId,
      updatedAt: cart.updatedAt,
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      quantity: items.reduce((sum, i) => sum + i.quantity, 0),
      items,
    }
  })
}
