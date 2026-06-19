import type { ProductInsert, ProductRow } from '@/types'

/**
 * Duplicates a product as variant (for different color/model)
 * @param originalProductId - ID of the product to duplicate
 * @returns New product data or null if failed
 */
export async function duplicateProductAsVariant(
  originalProductId: string,
): Promise<ProductRow | null> {
  const supabase = useSupabaseClient()

  // 1. Fetch original product
  const { data: original, error: fetchError } = await supabase
    .from('products')
    .select('*')
    .eq('id', originalProductId)
    .single()

  if (fetchError || !original) {
    console.error('[duplicateProductAsVariant] Failed to fetch original:', fetchError)
    return null
  }

  // 2. Generate or reuse model_group_id
  let modelGroupId = original.model_group_id

  if (!modelGroupId) {
    modelGroupId = crypto.randomUUID()

    const { error: updateError } = await supabase
      .from('products')
      .update({ model_group_id: modelGroupId })
      .eq('id', originalProductId)

    if (updateError) {
      console.error('[duplicateProductAsVariant] Failed to update original:', updateError)
      return null
    }
  }

  // 3. Prepare new product data
  const newProduct: ProductInsert = {
    name: original.name,
    description: original.description,
    price: original.price,
    discount_percentage: original.discount_percentage,
    category_id: original.category_id,
    brand_id: original.brand_id,
    origin_country_id: original.origin_country_id,
    material_id: original.material_id,
    bonus_points_award: original.bonus_points_award,
    min_age_years: original.min_age_years,
    max_age_years: original.max_age_years,
    gender: original.gender,
    accessory_ids: original.accessory_ids,
    is_accessory: original.is_accessory,
    is_active: original.is_active,
    is_featured: original.is_featured,
    featured_order: original.featured_order,
    is_promotion: original.is_promotion,
    product_line_id: original.product_line_id,
    seo_title: original.seo_title,
    seo_description: original.seo_description,
    meta_description: original.meta_description,
    seo_h1: original.seo_h1,
    stock_quantity: 0,
    sales_count: 0,
    slug: '',
    barcode: null,
    model_group_id: modelGroupId,
  }

  // 4. Insert new product
  const { data: newProductData, error: insertError } = await supabase
    .from('products')
    .insert(newProduct)
    .select()
    .single()

  if (insertError) {
    console.error('[duplicateProductAsVariant] Failed to insert:', insertError)
    return null
  }

  console.log('[duplicateProductAsVariant] Created variant:', newProductData.id)
  return newProductData
}
