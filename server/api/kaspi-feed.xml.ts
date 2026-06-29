export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)
  
  const { data: products, error } = await client.rpc('get_kaspi_feed_products')
  
  if (error) {
    console.error('Kaspi feed error:', error)
    throw createError({ statusCode: 500, message: error.message })
  }

  if (!products || products.length === 0) {
    console.warn('No products for Kaspi feed')
  }

  const currentDate = new Date().toISOString().split('T')[0]
  
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kaspi_catalog date="${currentDate}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">
  <company>Ухтышка</company>
  <merchantid>YOUR_MERCHANT_ID</merchantid>
  <offers>
${(products || []).map(p => `    <offer sku="${p.sku}">
      <model><![CDATA[${p.name}]]></model>
      <brand><![CDATA[${p.brand_name || ''}]]></brand>
      <availabilities>
        <availability available="${p.stock_quantity > 0 ? 'yes' : 'no'}" storeId="PP1" />
      </availabilities>
      <price>${p.kaspi_price}</price>
    </offer>`).join('\n')}
  </offers>
</kaspi_catalog>`

  setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  return xml
})
