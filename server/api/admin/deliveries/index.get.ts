/** «Поставки»: заказы поставщикам, товары строк и журнал приёмки — `server/utils/supplierDeliveries.ts`. */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return loadDeliveries(db)
})
