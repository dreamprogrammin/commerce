/**
 * Сброс кеша страниц после правок в админке (9 октября 2026).
 *
 * Кеш страниц суточный (ради лимита трафика Supabase), поэтому правка должна
 * доезжать до сайта сразу. Тело говорит, что изменилось, адреса сервер
 * собирает сам (server/utils/isrRevalidate.ts):
 *   productIds   — товары: карточка, разделы, связки, бренд, серия, главная;
 *   categoryIds  — разделы и разделы выше;
 *   brandIds     — страница бренда и все его серии;
 *   lineIds      — серия и её бренд;
 *   campaignIds  — товары акции;
 *   paths        — готовые адреса (удалённый бренд, главная после баннера);
 *   scope: 'catalog' — правка дерева разделов: все разделы, бренды, серии,
 *                      главная, `/catalog`, `/brands`.
 * Только администратор.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<Record<string, unknown>>(event)
  return runRevalidation(event, db, {
    productIds: uuidList(body?.productIds),
    categoryIds: uuidList(body?.categoryIds),
    brandIds: uuidList(body?.brandIds),
    lineIds: uuidList(body?.lineIds),
    campaignIds: uuidList(body?.campaignIds),
    paths: sanitizePaths(Array.isArray(body?.paths) ? body.paths.slice(0, 50) : []),
    scope: body?.scope === 'catalog' ? 'catalog' : undefined,
  })
})
