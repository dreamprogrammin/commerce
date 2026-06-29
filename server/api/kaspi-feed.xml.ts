export default defineEventHandler(async (event) => {
  try {
    const client = await serverSupabaseClient(event)
    
    const { data: products, error } = await client.rpc('get_kaspi_feed_products')
    
    if (error) {
      console.error('Kaspi feed RPC error:', error)
      // Возвращаем пустой фид вместо ошибки
      const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<kaspi_catalog date="${new Date().toISOString().split('T')[0]}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">
  <company>Ухтышка</company>
  <merchantid>YOUR_MERCHANT_ID</merchantid>
  <offers></offers>
</kaspi_catalog>`
      setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
      return emptyXml
    }

    const currentDate = new Date().toISOString().split('T')[0]
    
    const offersXml = (products || []).map(p => {
      return `    <offer sku="${p.sku || ''}">
      <model><![CDATA[${p.name || ''}]]></model>
      <brand><![CDATA[${p.brand_name || ''}]]></brand>
      <availabilities>
        <availability available="${p.stock_quantity > 0 ? 'yes' : 'no'}" storeId="PP1" />
      </availabilities>
      <price>${p.kaspi_price || 0}</price>
    </offer>`
    }).join('\n')
    
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<kaspi_catalog date="${currentDate}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">
  <company>Ухтышка</company>
  <merchantid>YOUR_MERCHANT_ID</merchantid>
  <offers>
${offersXml}
  </offers>
</kaspi_catalog>`

    setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
    return xml
  } catch (err) {
    console.error('Kaspi feed general error:', err)
    // Возвращаем минимальный валидный XML
    const errorXml = `<?xml version="1.0" encoding="UTF-8"?>
<kaspi_catalog date="${new Date().toISOString().split('T')[0]}" xmlns="kaspiShopping" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="kaspiShopping http://kaspi.kz/kaspishopping.xsd">
  <company>Ухтышка</company>
  <merchantid>YOUR_MERCHANT_ID</merchantid>
  <offers></offers>
</kaspi_catalog>`
    setResponseHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
    return errorXml
  }
})
