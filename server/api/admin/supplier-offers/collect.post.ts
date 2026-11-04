/**
 * Собрать новые товары канала поставщика. За раз — один канал и до 30
 * товаров; `more: true` — есть ещё, страница зовёт снова.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ channelId?: unknown }>(event)
  if (!isUuid(body?.channelId))
    throw createError({ statusCode: 400, message: 'Не указан канал' })
  return collectSupplierOffers(db, body.channelId)
})
