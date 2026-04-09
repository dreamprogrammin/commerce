/**
 * Скрипт для аудита качества alt текстов
 * 
 * Проверяет:
 * - Сколько изображений без alt текста
 * - Сколько с дефолтными alt текстами
 * - Сколько с качественными alt текстами
 * 
 * Запуск: npm run seo:audit
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
const supabaseKey = process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Отсутствуют переменные окружения SUPABASE')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface ImageStats {
  total: number
  withoutAlt: number
  withDefaultAlt: number
  withGoodAlt: number
  examples: {
    without: string[]
    default: string[]
    good: string[]
  }
}

async function auditAltTexts() {
  console.log('🔍 Начинаем аудит alt текстов...\n')

  const { data: images, error } = await supabase
    .from('product_images')
    .select(`
      id,
      image_url,
      alt_text,
      products(name, slug)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('❌ Ошибка загрузки изображений:', error)
    return
  }

  if (!images || images.length === 0) {
    console.log('⚠️  Изображения не найдены')
    return
  }

  const stats: ImageStats = {
    total: images.length,
    withoutAlt: 0,
    withDefaultAlt: 0,
    withGoodAlt: 0,
    examples: {
      without: [],
      default: [],
      good: [],
    },
  }

  for (const image of images) {
    const productName = (image as any).products?.name || 'Unknown'
    const productSlug = (image as any).products?.slug || 'unknown'

    if (!image.alt_text) {
      stats.withoutAlt++
      if (stats.examples.without.length < 5) {
        stats.examples.without.push(`${productSlug}: (пусто)`)
      }
    } else if (
      image.alt_text.includes('Изображение товара')
      || image.alt_text === 'Image'
      || image.alt_text.match(/^фото \d+$/)
    ) {
      stats.withDefaultAlt++
      if (stats.examples.default.length < 5) {
        stats.examples.default.push(`${productSlug}: "${image.alt_text}"`)
      }
    } else {
      stats.withGoodAlt++
      if (stats.examples.good.length < 5) {
        stats.examples.good.push(`${productSlug}: "${image.alt_text}"`)
      }
    }
  }

  // Вывод статистики
  console.log('📊 Статистика alt текстов:\n')
  console.log(`📷 Всего изображений: ${stats.total}`)
  console.log(`✅ С качественным alt: ${stats.withGoodAlt} (${((stats.withGoodAlt / stats.total) * 100).toFixed(1)}%)`)
  console.log(`⚠️  С дефолтным alt: ${stats.withDefaultAlt} (${((stats.withDefaultAlt / stats.total) * 100).toFixed(1)}%)`)
  console.log(`❌ Без alt текста: ${stats.withoutAlt} (${((stats.withoutAlt / stats.total) * 100).toFixed(1)}%)`)

  // Примеры
  if (stats.examples.good.length > 0) {
    console.log('\n✨ Примеры качественных alt текстов:')
    stats.examples.good.forEach(ex => console.log(`   ${ex}`))
  }

  if (stats.examples.default.length > 0) {
    console.log('\n⚠️  Примеры дефолтных alt текстов:')
    stats.examples.default.forEach(ex => console.log(`   ${ex}`))
  }

  if (stats.examples.without.length > 0) {
    console.log('\n❌ Примеры без alt текста:')
    stats.examples.without.forEach(ex => console.log(`   ${ex}`))
  }

  // Рекомендации
  console.log('\n💡 Рекомендации:')
  if (stats.withoutAlt > 0 || stats.withDefaultAlt > 0) {
    console.log('   Запусти: npx tsx scripts/generate-alt-texts.ts')
  } else {
    console.log('   Все отлично! Все изображения имеют качественные alt тексты.')
  }

  console.log('\n✨ Аудит завершен!')
}

auditAltTexts().catch(console.error)
