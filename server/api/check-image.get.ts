import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)

  const { data } = await supabase
    .from('products')
    .select('id, name, product_images(image_url, display_order)')
    .eq('id', '47b6b53a-3b66-49ac-9657-4d91bff96fe4')
    .single()

  return data
})
