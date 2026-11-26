/**
 * «На сайт» из «Товаров поставщиков»: название, описание, SEO-описание,
 * раздел и бренд товара — моделью «Тексты для сайта» (server/utils/contentWriter.ts).
 * Ничего не сохраняет: ответ подставляется в форму нового товара.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ id?: unknown, item?: unknown }>(event)
  const id = typeof body?.id === 'string' ? body.id : ''
  const item = typeof body?.item === 'number' && Number.isInteger(body.item) && body.item >= 0 ? body.item : -1
  if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(id) || item < 0)
    throw createError({ statusCode: 400, message: 'Нужны товар поставщика и номер товара в посте' })
  return writeOfferProduct(db, id, item)
})
