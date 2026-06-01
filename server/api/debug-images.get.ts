import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data } = await supabase
    .from('products')
    .select('id, name, product_images(image_url)')
    .eq('is_active', true)
    .limit(1)

  return data
})
