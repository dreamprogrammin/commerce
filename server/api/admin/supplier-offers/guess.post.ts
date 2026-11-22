/**
 * Разобрать ИИ новые прочитанные товары (22 ноября 2026): как такую вещь
 * ищут и к какой теме спроса она ближе по смыслу — до 40 постов за раз;
 * `more: true` — есть ещё, страница зовёт снова. Подробности —
 * server/utils/supplierGuess.ts.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  return fillOfferGuesses(db)
})
