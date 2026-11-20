/** Очередь «проверить на Kaspi» и топ спроса товаров поставщиков (20.11.2026) */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const board = await kaspiBoard(db)
  return board ? { installed: true as const, ...board } : { installed: false as const }
})
