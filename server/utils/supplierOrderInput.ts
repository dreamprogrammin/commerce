/**
 * Разбор тела запросов заказов поставщику (`/api/admin/restock/orders*`).
 * Окончательно всё проверяют функции базы `admin_*_supplier_order*`; здесь —
 * чтобы негодное тело получило понятный 400, а не ошибку приведения типов.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/** Строки `{ productId, quantity }` → `{ product_id, quantity }` для функции базы. */
export function parseOrderItems(raw: unknown, min: number): { product_id: string, quantity: number }[] {
  if (!Array.isArray(raw) || raw.length > 300)
    throw createError({ statusCode: 400, message: 'Не переданы строки заказа' })
  return raw.map((row) => {
    const productId = typeof row?.productId === 'string' ? row.productId : ''
    const quantity = Number(row?.quantity)
    if (!isUuid(productId))
      throw createError({ statusCode: 400, message: 'Не указан товар' })
    if (!Number.isInteger(quantity) || quantity < min || quantity > 9999)
      throw createError({ statusCode: 400, message: `Количество — целое число от ${min} до 9999` })
    return { product_id: productId, quantity }
  })
}

export function orderIdParam(id: string | undefined): string {
  if (!isUuid(id))
    throw createError({ statusCode: 400, message: 'Неверный id заказа' })
  return id
}

/** Отказ функции базы (RAISE EXCEPTION) — это ответ человеку, а не сбой. */
export function throwRpcError(error: { code?: string, message: string }): never {
  throw createError({ statusCode: error.code === 'P0001' ? 400 : 500, message: error.message })
}
