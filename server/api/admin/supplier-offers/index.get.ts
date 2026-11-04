import { isOfferStatus } from '~/utils/supplierOfferList'

/**
 * «Товары поставщиков»: товары одного статуса за 30 дней, каналы и счётчики.
 * В Telegram не ходит — только база. Без миграции 20261104160000 —
 * `installed: false`.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const { status = 'new' } = getQuery(event)
  if (!isOfferStatus(status))
    throw createError({ statusCode: 400, message: 'Неверный статус' })
  return supplierOffersPage(db, status)
})
