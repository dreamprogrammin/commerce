/**
 * API endpoint для генерации alt-текстов
 * 
 * Вызов: POST /api/generate-alt-texts
 */

import { createClient } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  
  // Используем service role key для обхода RLS
  const supabaseUrl = config.public.supabase?.url
  const supabaseKey = config.supabaseServiceKey || config.public.supabase?.key

  if (!supabaseUrl || !supabaseKey) {
    throw createError({
      statusCode: 500,
      message: 'Missing Supabase credentials'
    })
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })

  // Генерация alt-текстов
  function generateAlt(product: any, index: number, total: number): string {
    const parts = []
    if (product.brands?.name) parts.push(product.brands.name)
    parts.push(product.name)
    if (product.product_lines?.name) parts.push(product.product_lines.name)
    
    if (index === 0) parts.push('купить в Казахстане')
    else if (index === 1 && total > 1) parts.push('вид сбоку')
    else if (index === 2 && total > 2) parts.push('детальное фото')
    else if (index === total - 1 && total > 3) parts.push('в упаковке')
    else parts.push(`фото ${index + 1}`)
    
    return parts.join(' ')
  }

  // Загрузка товаров
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      brands(name),
      product_lines(name),
      product_images(id, image_url, alt_text, display_order)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    throw createError({
      statusCode: 500,
      message: error.message
    })
  }

  let updated = 0
  let skipped = 0

  // Обновление alt-текстов
  for (const product of products || []) {
    const images = product.product_images || []
    
    for (let i = 0; i < images.length; i++) {
      const image = images[i]
      
      // Пропускаем если уже есть качественный alt
      if (image.alt_text && !image.alt_text.includes('Изображение товара')) {
        skipped++
        continue
      }

      const altText = generateAlt(product, i, images.length)

      const { error: updateError } = await supabase
        .from('product_images')
        .update({ alt_text: altText })
        .eq('id', image.id)

      if (updateError) {
        console.error(`Error updating image ${image.id}:`, updateError)
      } else {
        updated++
      }
    }
  }

  return {
    success: true,
    updated,
    skipped,
    total: updated + skipped
  }
})
