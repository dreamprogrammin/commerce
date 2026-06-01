import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data: products } = await supabase
    .from('products')
    .select('id, name, images, final_price, is_active')
    .limit(3)

  return {
    count: products?.length || 0,
    products: products?.map(p => ({
      id: p.id,
      name: p.name,
      images: p.images,
      images_type: typeof p.images,
      images_is_array: Array.isArray(p.images),
      final_price: p.final_price,
      is_active: p.is_active,
    })),
  }
})
