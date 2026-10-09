/**
 * Сброс кеша страниц, где виден товар, — после сохранения в админке.
 *
 * Тело: `{ productId }` — товар читается из базы (после создания и изменения);
 * либо `{ slug, categoryId, brandId }` — для удалённого товара, которого в
 * базе уже нет. Только администратор. Адреса — те же, что у общего сброса
 * (`/api/admin/revalidate`): с 9 октября в них входят и связки «раздел +
 * бренд», и серия.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ productId?: string, slug?: string, categoryId?: string, brandId?: string }>(event)

  const productIds = uuidList(body?.productId ? [body.productId] : [])
  if (productIds.length)
    return runRevalidation(event, db, { productIds })

  // Удалённый товар: строки в базе нет, адреса — по тому, что прислала админка
  const slug = typeof body?.slug === 'string' ? body.slug : null
  if (!slug || !/^[\w-]+$/.test(slug))
    throw createError({ statusCode: 400, message: 'Не указан товар' })
  const [brandId] = uuidList(body?.brandId ? [body.brandId] : [])
  const [categoryId] = uuidList(body?.categoryId ? [body.categoryId] : [])
  const [{ data: categories }, { data: brand }] = await Promise.all([
    db.from('categories').select('id, parent_id, slug, href'),
    brandId ? db.from('brands').select('slug').eq('id', brandId).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const paths = revalidationPaths({ productSlug: slug, categoryId, brandSlug: brand?.slug ?? null }, categories ?? [])
  return runRevalidation(event, db, {}, paths)
})
