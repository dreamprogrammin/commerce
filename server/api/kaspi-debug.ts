export default defineEventHandler(async (event) => {
  const client = await serverSupabaseClient(event)
  
  const { data: products, error } = await client.rpc('get_kaspi_feed_products')
  
  return {
    error: error?.message || null,
    count: products?.length || 0,
    products: products || []
  }
})
