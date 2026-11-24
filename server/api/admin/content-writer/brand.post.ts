/**
 * Бренд, которого нет на сайте: поиск в интернете и страница бренда по
 * найденному (server/utils/contentWriter.ts). Ничего не создаёт — бренд
 * создаётся вместе с товаром, по «Создать товар».
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ name?: unknown, product?: unknown, article?: unknown }>(event)
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')
  const name = text(body?.name, 60)
  const product = text(body?.product, 200)
  if (!name || !product)
    throw createError({ statusCode: 400, message: 'Нужны бренд и товар, по которому его искать' })
  return researchBrand(db, { name, product, article: text(body?.article, 60) || null })
})
