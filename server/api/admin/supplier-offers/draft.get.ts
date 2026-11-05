/** Черновик товара сайта из товара поставщика — для «На сайт» (5 ноября 2026). */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getQuery(event).id
  if (typeof id !== 'string' || !isUuid(id))
    throw createError({ statusCode: 400, message: 'Не указан товар поставщика' })
  return supplierOfferDraft(db, id)
})
