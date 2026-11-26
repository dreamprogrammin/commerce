/**
 * Черновик товара сайта из товара поставщика — для «На сайт» (5 ноября 2026).
 * С 26.11.2026 — и тексты, уже написанные ИИ по товарам поста: форма берёт
 * их, а не просит ИИ снова (`supplier_offers.written_texts`).
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const id = getQuery(event).id
  if (typeof id !== 'string' || !isUuid(id))
    throw createError({ statusCode: 400, message: 'Не указан товар поставщика' })
  const draft = await supplierOfferDraft(db, id)
  return { ...draft, written: await freshSavedTexts(db, draft.written) }
})
