/**
 * «Прочитать» — новые товары, которые ИИ ещё не прочёл или не смог прочесть
 * (5 ноября 2026). За раз — до 10 товаров; `more: true` — есть ещё, страница
 * зовёт снова. `before` — когда страница начала проход: уже пробованное в нём
 * второй раз не берётся.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ before?: unknown }>(event)
  const before = typeof body?.before === 'string' ? Date.parse(body.before) : Number.NaN
  if (!Number.isFinite(before))
    throw createError({ statusCode: 400, message: 'Не указано начало прохода' })
  // Своей строкой, не присланной: время уходит в фильтр запроса к базе
  return rereadSupplierOffers(db, new Date(Math.min(before, Date.now())).toISOString())
})
