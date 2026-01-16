/**
 * Массовая переиндексация всех товаров
 * Только для администраторов
 */

import type { Database } from '@/types/supabase'
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient<Database>(event)

  // Проверяем авторизацию
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    throw createError({
      statusCode: 401,
      message: 'Unauthorized: Please login',
    })
  }

  // ✅ Правильная типизация с использованием Database типов
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile || profile.role !== 'admin') {
    throw createError({
      statusCode: 403,
      message: 'Forbidden: Admin access required',
    })
  }

  try {
    // Получаем все активные товары
    const { data: products, error } = await supabase
      .from('products')
      .select('slug')
      .eq('is_active', true)

    if (error) {
      throw createError({
        statusCode: 500,
        message: `Database error: ${error.message}`,
      })
    }

    if (!products || products.length === 0) {
      return {
        success: true,
        total: 0,
        message: 'No products found',
      }
    }

    // Формируем URL товаров
    const urls = products.map(p => `https://uhti.kz/catalog/products/${p.slug}`)

    // Отправляем батчами по 100 URL
    const batchSize = 100
    const results = []

    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize)

      const result = await $fetch('/api/seo/notify-indexing', {
        method: 'POST',
        body: { urls: batch },
      })

      results.push(result)

      // Небольшая задержка между батчами
      if (i + batchSize < urls.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    const successfulBatches = results.filter(r => r.success).length
    const totalSubmitted = results.reduce((sum, r) => sum + r.indexnow.urls_count, 0)

    return {
      success: successfulBatches > 0,
      total: products.length,
      submitted: totalSubmitted,
      batches: results.length,
      successfulBatches,
      failedBatches: results.length - successfulBatches,
    }
  }
  catch (error: any) {
    console.error('[SEO] Reindex error:', error)
    throw createError({
      statusCode: 500,
      message: `Reindex failed: ${error.message}`,
    })
  }
})
