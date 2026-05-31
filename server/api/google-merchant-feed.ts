import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data: products } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      description,
      price,
      final_price,
      in_stock,
      images,
      brand:brands(name),
      category:categories(name, slug)
    `)
    .eq('is_active', true)
    .order('name', { ascending: true })

  const baseUrl = 'https://uhti.kz'

  const items = (products || [])
    .filter(product => product.final_price && product.final_price > 0)
    .map((product) => {
      // Безопасное получение первого изображения
      const images = product.images || []
      const firstImage = Array.isArray(images) && images.length > 0 ? images[0] : null
      
      if (!firstImage) return null // Пропускаем товары без изображений
      
      const imageUrl = `${baseUrl}/storage/products/${firstImage}`
      const productUrl = `${baseUrl}/catalog/products/${product.slug}`
      const hasDiscount = product.price > product.final_price

      return `
    <item>
      <g:id>${product.id}</g:id>
      <g:title><![CDATA[${product.name}]]></g:title>
      <g:description><![CDATA[${product.description || product.name}]]></g:description>
      <g:link>${productUrl}</g:link>
      <g:image_link>${imageUrl}</g:image_link>
      <g:availability>${product.in_stock ? 'in_stock' : 'out_of_stock'}</g:availability>
      <g:price>${hasDiscount ? product.price : product.final_price} KZT</g:price>
      ${hasDiscount ? `<g:sale_price>${product.final_price} KZT</g:sale_price>` : ''}
      <g:brand><![CDATA[${product.brand?.name || 'Ухтышка'}]]></g:brand>
      <g:condition>new</g:condition>
      <g:google_product_category>1253</g:google_product_category>
      <g:product_type><![CDATA[${product.category?.name || 'Игрушки'}]]></g:product_type>
      <g:identifier_exists>false</g:identifier_exists>
    </item>`
    })
    .filter(Boolean) // Убираем null значения
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
