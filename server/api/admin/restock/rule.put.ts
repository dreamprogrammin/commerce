/**
 * Правило закупки товара: при каком остатке он попадает в «К закупке» и
 * сколько брать. До 30.10.2026 оно правилось только в карточке товара, по
 * одному, — и у всех 186 товаров стояло одно и то же: 2 и 5.
 *
 * Триггеры товара на эти поля не смотрят: оповещения «снова в наличии» и
 * избранного срабатывают только на остаток, цену и скидку.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ productId?: unknown, minStock?: unknown, restockQty?: unknown }>(event)
  const productId = typeof body?.productId === 'string' ? body.productId : ''
  const minStock = Number(body?.minStock)
  const restockQty = Number(body?.restockQty)
  if (!UUID.test(productId))
    throw createError({ statusCode: 400, message: 'Не указан товар' })
  if (!Number.isInteger(minStock) || minStock < 0 || minStock > 999)
    throw createError({ statusCode: 400, message: 'Порог — целое число от 0 до 999' })
  if (!Number.isInteger(restockQty) || restockQty < 1 || restockQty > 999)
    throw createError({ statusCode: 400, message: 'Сколько брать — целое число от 1 до 999' })

  const { data, error } = await db.from('products')
    .update({ min_stock_level: minStock, restock_quantity: restockQty })
    .eq('id', productId)
    .select('id, min_stock_level, restock_quantity')
    .maybeSingle()
  if (error)
    throw createError({ statusCode: 500, message: error.message })
  if (!data)
    throw createError({ statusCode: 404, message: 'Товар не найден' })
  return { productId: data.id, minStock: data.min_stock_level, restockQty: data.restock_quantity }
})
