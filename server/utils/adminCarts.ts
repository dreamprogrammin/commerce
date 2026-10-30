import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Корзины вошедших покупателей для админки — с названиями, текущими ценами и
 * остатками товаров.
 *
 * Зачем (31 октября 2026). Владелец хотел видеть, что покупатели кладут в
 * корзину: в карточке покупателя и в «К закупке». Google Analytics этого не
 * скажет — она обезличена. Корзина вошедшего покупателя лежит в
 * `server_carts`; у гостей она только в их браузере, их здесь нет. Корзина
 * очищается при оформлении — непустая значит «ещё не заказано».
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
  userId: string
  updatedAt: string
  total: number
  quantity: number
  items: AdminCartItem[]
}

export async function loadCarts(db: SupabaseClient, userIds?: string[]): Promise<AdminCart[]> {
  let query = db.from('server_carts').select('user_id, items, updated_at').order('updated_at', { ascending: false })
  if (userIds)
    query = query.in('user_id', userIds)
  const { data: carts, error } = await query
  if (error)
    throw createError({ statusCode: 500, message: error.message })

  const filled = (carts ?? []).filter(c => Array.isArray(c.items) && c.items.length > 0)
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
      userId: cart.user_id,
      updatedAt: cart.updated_at,
      total: items.reduce((sum, i) => sum + i.price * i.quantity, 0),
      quantity: items.reduce((sum, i) => sum + i.quantity, 0),
      items,
    }
  })
}
