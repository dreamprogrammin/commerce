import { serverSupabaseClient } from '#supabase/server'

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
      stock_quantity,
      brand:brands(name),
      category:categories(name, slug),
      product_images(image_url, display_order)
    `)
    .eq('is_active', true)
    .gt('price', 0)
    .order('name', { ascending: true })

  // Полезно для отладки — убери после фикса
  if (error) {
    console.error('Supabase query error:', error)
    throw createError({ statusCode: 500, message: error.message })
  }

  console.log(`Fetched ${products?.length ?? 0} products`)

  const baseUrl = 'https://uhti.kz'

  const items = (products || [])
    .map((product) => {
      // Сортируем по display_order, берём первое изображение
      const images = product.product_images ?? []
      const sortedImages = [...images].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      const firstImage = sortedImages[0]

      if (!firstImage?.image_url) return null // Нет фото — пропускаем

      // Формируем полный URL для изображения
      const imageUrl = firstImage.image_url.startsWith('http') 
        ? firstImage.image_url 
        : `${baseUrl}/storage/${firstImage.image_url}`
      const productUrl = `${baseUrl}/catalog/products/${product.slug}`

      // Если final_price null — значит скидки нет, используем price
      const effectivePrice = product.final_price ?? product.price
      const hasDiscount = product.final_price !== null && product.price > product.final_price
      const inStock = (product.stock_quantity ?? 0) > 0

      return `
    <item>
      <g:id>${product.id}</g:id>
      <g:title><![CDATA[${product.name}]]></g:title>
      <g:description><![CDATA[${product.description || product.name}]]></g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:availability>${inStock ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${hasDiscount ? product.price : effectivePrice} KZT</g:price>
      ${hasDiscount ? `<g:sale_price>${product.final_price} KZT</g:sale_price>` : ''}
      <g:brand><![CDATA[${product.brand?.name || 'Ухтышка'}]]></g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>1253</g:google_product_category>
      <g:product_type><![CDATA[${product.category?.name || 'Игрушки'}]]></g:product_type>
      <g:identifier_exists>false</g:identifier_exists>
    </item>`
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