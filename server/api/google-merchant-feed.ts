import { serverSupabaseClient } from '#supabase/server'
import { feedItemXml } from '~/utils/merchantFeed'

/*
 * Фид для Google Merchant Center: /api/google-merchant-feed.
 *
 * Что и почему отдаётся в каждом поле — в utils/merchantFeed.ts, там же
 * тесты. Здесь только выборка и сборка документа.
 */
export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      description,
      price,
      final_price,
      discount_percentage,
      stock_quantity,
      barcode,
      brand:brands(name),
      category:categories(name, seo_h1),
      product_images(image_url, display_order)
    `)
    .eq('is_active', true)
    .gt('price', 0)
    .order('name', { ascending: true })

  if (error) {
    console.error('Supabase query error:', error)
    throw createError({ statusCode: 500, message: error.message })
  }

  const baseUrl = 'https://uhti.kz'

  const items = (products || [])
    .map((product: any) => {
      // Первое фото по display_order; без фото товар в фид не идёт.
      const images = product.product_images ?? []
      const firstImage = [...images].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]
      if (!firstImage?.image_url)
        return null

      let imageUrl = firstImage.image_url.startsWith('http')
        ? firstImage.image_url
        : `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/product-images/${firstImage.image_url}`

      /*
       * Вариант `_lg`, а не `_md`: md — 600–800 px, lg — до 1440 px (замер
       * 22 сентября 2026 по 40 товарам). Merchant Center с 31 января 2027
       * требует не меньше 500×500 и просит не отдавать уменьшенные копии.
       */
      if (!/\.(?:webp|jpg|jpeg|png)$/i.test(imageUrl))
        imageUrl += '_lg.webp'

      return feedItemXml({
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
        price: product.price,
        final_price: product.final_price,
        discount_percentage: product.discount_percentage,
        stock_quantity: product.stock_quantity,
        barcode: product.barcode,
        brandName: product.brand?.name ?? null,
        // Читаемое имя раздела: в `name` у части разделов дательный падеж.
        categoryName: product.category?.seo_h1 || product.category?.name || null,
        imageUrl,
      }, baseUrl)
    })
    .filter(Boolean)
    .join('\n')

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>Ухтышка - Интернет-магазин игрушек</title>
    <link>${baseUrl}</link>
    <description>Широкий ассортимент качественных игрушек</description>
${items}
  </channel>
</rss>`

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setResponseHeader(event, 'Cache-Control', 'public, max-age=3600')

  return xml
})
