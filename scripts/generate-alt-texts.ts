/**
 * Скрипт для генерации и обновления alt текстов для всех изображений товаров
 * 
 * Запуск: npm run seo:generate
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join } from 'path'

// Загружаем переменные окружения из .env
try {
  const envFile = readFileSync(join(process.cwd(), '.env'), 'utf-8')
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
} catch (e) {
  // .env файл не найден, используем существующие переменные окружения
}

const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют переменные окружения SUPABASE')
  process.exit(1)
}

// Используем service role key для обхода RLS
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

interface ProductWithImages {
  id: string
  name: string
  slug: string
  brands: { name: string } | null
  product_lines: { name: string } | null
  product_images: Array<{
    id: string
    image_url: string
    display_order: number
    alt_text: string | null
  }>
}

function generateAltText(
  productName: string,
  brandName: string | null,
  lineName: string | null,
  index: number,
  totalImages: number,
): string {
  const parts: string[] = []

  if (brandName) parts.push(brandName)
  parts.push(productName)
  if (lineName) parts.push(lineName)

  if (index === 0) {
    parts.push('купить в Казахстане')
  } else if (index === 1 && totalImages > 1) {
    parts.push('вид сбоку')
  } else if (index === 2 && totalImages > 2) {
    parts.push('детальное фото')
  } else if (index === totalImages - 1 && totalImages > 3) {
    parts.push('в упаковке')
  } else {
    parts.push(`фото ${index + 1}`)
  }

  return parts.join(' ')
}

async function updateAltTexts() {
  console.log('🚀 Начинаем генерацию alt текстов...\n')

  // Получаем все товары с изображениями
  const { data: products, error } = await supabase
    .from('products')
    .select(`
      id,
      name,
      slug,
      brands(name),
      product_lines(name),
      product_images(id, image_url, display_order, alt_text)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Ошибка загрузки товаров:', error)
    return
  }

  if (!products || products.length === 0) {
    console.log('⚠️  Товары не найдены')
    return
  }

  console.log(`📦 Найдено товаров: ${products.length}`)

  let updatedCount = 0
  let skippedCount = 0
  let errorCount = 0

  for (const product of products as unknown as ProductWithImages[]) {
    if (!product.product_images || product.product_images.length === 0) {
      continue
    }

    const brandName = product.brands?.name || null
    const lineName = product.product_lines?.name || null
    const totalImages = product.product_images.length

    // Сортируем изображения по display_order
    const sortedImages = [...product.product_images].sort(
      (a, b) => a.display_order - b.display_order,
    )

    for (let i = 0; i < sortedImages.length; i++) {
      const image = sortedImages[i]

      // Пропускаем, если alt_text уже заполнен и не является дефолтным
      if (
        image.alt_text
        && !image.alt_text.includes('Изображение товара')
        && !image.alt_text.includes('фото 1')
      ) {
        skippedCount++
        continue
      }

      const newAltText = generateAltText(
        product.name,
        brandName,
        lineName,
        i,
        totalImages,
      )

      // Обновляем alt_text
      const { error: updateError } = await supabase
        .from('product_images')
        .update({ alt_text: newAltText })
        .eq('id', image.id)

      if (updateError) {
        console.error(
          `❌ Ошибка обновления изображения ${image.id}:`,
          updateError,
        )
        errorCount++
      } else {
        updatedCount++
        console.log(`✅ ${product.slug} [${i + 1}/${totalImages}]: "${newAltText}"`)
      }
    }
  }

  console.log('\n📊 Статистика:')
  console.log(`   ✅ Обновлено: ${updatedCount}`)
  console.log(`   ⏭️  Пропущено: ${skippedCount}`)
  console.log(`   ❌ Ошибок: ${errorCount}`)
  console.log('\n✨ Готово!')
}

updateAltTexts().catch(console.error)
