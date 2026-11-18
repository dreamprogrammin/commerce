/**
 * Подобрать запросы покупателя новым прочитанным товарам (18 ноября 2026) —
 * до 40 постов за раз; `more: true` — есть ещё, страница зовёт снова.
 * Подробности — server/utils/supplierQueries.ts.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return fillOfferQueries(db)
})
