import { isOfferStatus } from '~/utils/supplierOfferList'

/** «Добавил на сайт», «Не брать» или «Вернуть» — для одного товара или нескольких. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ ids?: unknown, status?: unknown }>(event)
  const ids = Array.isArray(body?.ids) ? body.ids : []
  if (!ids.length || ids.length > 300 || !ids.every(isUuid))
    throw createError({ statusCode: 400, message: 'Не указаны товары' })
  if (!isOfferStatus(body.status))
    throw createError({ statusCode: 400, message: 'Неверный статус' })
  return setSupplierOffersStatus(db, event.context.adminId, ids, body.status)
})
