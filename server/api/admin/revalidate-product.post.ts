import process from 'node:process'

/**
 * Сброс кеша страниц, где виден товар, — после сохранения в админке.
 *
 * Тело: `{ productId }` — товар читается из базы (после создания и изменения);
 * либо `{ slug, categoryId, brandId }` — для удалённого товара, которого в
 * базе уже нет. Только администратор. Без токена (`ISR_BYPASS_TOKEN`) и вне
 * Vercel ничего не делает и говорит об этом в ответе.
 */
export default defineEventHandler(async (event) => {
  const db = await requireAdmin(event)
  const body = await readBody<{ productId?: string, slug?: string, categoryId?: string, brandId?: string }>(event)

  let slug = body?.slug ?? null
  let categoryId = body?.categoryId ?? null
  let brandId = body?.brandId ?? null
  if (body?.productId) {
    const { data } = await db.from('products').select('slug, category_id, brand_id').eq('id', body.productId).maybeSingle()
    if (data) {
      slug = data.slug
      categoryId = data.category_id
      brandId = data.brand_id
    }
  }
  if (!slug)
    throw createError({ statusCode: 400, message: 'Не указан товар' })

  const token = useRuntimeConfig(event).isrBypassToken
  if (!token || !process.env.VERCEL)
    return { revalidated: 0, skipped: !token ? 'нет ISR_BYPASS_TOKEN' : 'не Vercel — кеша ISR нет' }

  const [{ data: categories }, { data: brand }] = await Promise.all([
    db.from('categories').select('id, parent_id, slug, href'),
    brandId ? db.from('brands').select('slug').eq('id', brandId).maybeSingle() : Promise.resolve({ data: null }),
  ])

  const paths = revalidationPaths({ productSlug: slug, categoryId, brandSlug: brand?.slug ?? null }, categories ?? [])
  const results = await revalidateOnVercel(getRequestURL(event).origin, token, paths)
  const failed = results.filter(r => r.status === 0 || r.status >= 500)
  return { revalidated: results.length - failed.length, failed }
})
