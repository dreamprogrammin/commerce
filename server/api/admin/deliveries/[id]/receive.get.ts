/**
 * Заказ для экрана «Приёмка по факту» (27.11.2026) — строки, фото, остаток,
 * штрихкоды и артикулы (server/utils/supplierDeliveries.ts → loadReceiveOrder).
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return loadReceiveOrder(db, orderIdParam(getRouterParam(event, 'id')))
})
