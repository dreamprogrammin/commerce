import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data } = await supabase
    .from('products')
    .select('id, name, product_images(image_url, display_order)')
    .eq('is_active', true)
    .limit(3)

  return data
})
