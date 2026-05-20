import type { Database } from '@/types'

interface SeoTemplateData {
  brandName: string
  brandSlug: string
  categoryName: string
  categorySlug: string
  productsCount: number
  minPrice: number
  maxPrice: number
  city?: string
  rating?: number
  reviewsCount?: number
}

export function useSeoTemplates() {
  const supabase = useSupabaseClient<Database>()

  /**
   * Генерирует SEO-текст для страницы категория + бренд
   */
  function generateBrandCategorySeoText(data: SeoTemplateData): string {
    const city = data.city || 'Алматы'
    
    const templates = [
      `Ухтышка — это официальный интернет-магазин в ${city}, где можно купить оригинальные ${data.categoryName.toLowerCase()} ${data.brandName}. Мы не крупная сеть, а уютный локальный сервис с собственным складом в мкр. Шапагат. Благодаря этому наши цены часто выгоднее, чем на Kaspi. В ассортименте ${data.productsCount} моделей от ${data.minPrice.toLocaleString('ru-KZ')} ₸. Вы можете заказать доставку ${data.brandName} день-в-день или забрать товар самовывозом.`,
      
      `В Ухтышке представлен широкий выбор ${data.categoryName.toLowerCase()} ${data.brandName} — ${data.productsCount} моделей по цене от ${data.minPrice.toLocaleString('ru-KZ')} до ${data.maxPrice.toLocaleString('ru-KZ')} ₸. Мы работаем как локальный сервис со складом в мкр. Шапагат (${city}), поэтому можем предложить цены выгоднее Kaspi и доставку день-в-день. Заказывайте ${data.brandName} с самовывозом или курьерской доставкой!`,
      
      `Ищете ${data.categoryName.toLowerCase()} ${data.brandName} в ${city}? Ухтышка — уютный локальный магазин с собственным складом в мкр. Шапагат. У нас ${data.productsCount} моделей ${data.brandName} от ${data.minPrice.toLocaleString('ru-KZ')} ₸. Проверяйте цены — мы часто выгоднее Kaspi! Доставка день-в-день или самовывоз в удобное время.`,
      
      `Ухтышка предлагает оригинальные ${data.categoryName.toLowerCase()} ${data.brandName} с доставкой по ${city}. Это не сетевой магазин, а локальный сервис со складом в мкр. Шапагат — поэтому цены конкурентные (часто ниже Kaspi). В наличии ${data.productsCount} моделей от ${data.minPrice.toLocaleString('ru-KZ')} до ${data.maxPrice.toLocaleString('ru-KZ')} ₸. Заказывайте с доставкой день-в-день!`,
    ]
    
    // Детерминированный выбор шаблона на основе хеша brand_id + category_id
    const hash = (data.brandSlug + data.categorySlug).split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return templates[hash % templates.length]
  }

  /**
   * Генерирует H1 для страницы категория + бренд
   */
  function generateBrandCategoryH1(data: SeoTemplateData): string {
    return `${data.categoryName} ${data.brandName} — купить в Алматы`
  }

  /**
   * Генерирует Title для страницы категория + бренд
   */
  function generateBrandCategoryTitle(data: SeoTemplateData): string {
    return `${data.categoryName} ${data.brandName} — купить в Алматы с доставкой | Ухтышка`
  }

  /**
   * Генерирует Description для страницы категория + бренд (гибридный сниппет)
   */
  function generateBrandCategoryDescription(data: SeoTemplateData): string {
    const city = data.city || 'Алматы'
    const parts = []
    
    // Эмоциональная фраза + бренд
    parts.push(`${data.categoryName} ${data.brandName} в Ухтышке`)
    
    // Цена
    parts.push(`💰 Цены от ${data.minPrice.toLocaleString('ru-KZ')} ₸`)
    
    // Рейтинг и отзывы (если есть)
    if (data.rating && data.reviewsCount && data.reviewsCount > 0) {
      parts.push(`⭐ Рейтинг: ${data.rating.toFixed(1)} (${data.reviewsCount} отз)`)
    }
    
    // Доставка и призыв
    parts.push(`Быстрая доставка по ${city} за 1 день. Заказывайте оригиналы прямо сейчас!`)
    
    const result = parts.join('. ')
    return result.length > 180 ? `${result.substring(0, 177)}...` : result
  }

  /**
   * Генерирует FAQ для страницы категория + бренд
   */
  function generateBrandCategoryFaq(data: SeoTemplateData) {
    const city = data.city || 'Алматы'
    
    return [
      {
        question: `Где купить ${data.categoryName.toLowerCase()} ${data.brandName} в ${city}?`,
        answer: `Лучший выбор ${data.categoryName.toLowerCase()} ${data.brandName} в ${city} представлен в специализированном интернет-магазине Ухтышка (uhti.kz). Мы предлагаем ${data.productsCount} моделей с бесплатной доставкой от 10 000 ₸ и начислением бонусов на следующую покупку.`,
      },
      {
        question: `Сколько стоят ${data.categoryName.toLowerCase()} ${data.brandName}?`,
        answer: `Цены на ${data.categoryName.toLowerCase()} ${data.brandName} в Ухтышке начинаются от ${data.minPrice.toLocaleString('ru-KZ')} ₸. Самые популярные модели стоят от ${Math.round(data.minPrice * 1.5).toLocaleString('ru-KZ')} до ${Math.round(data.maxPrice * 0.7).toLocaleString('ru-KZ')} ₸.`,
      },
      {
        question: `Как быстро доставят ${data.categoryName.toLowerCase()} ${data.brandName} в ${city}?`,
        answer: `Доставка ${data.categoryName.toLowerCase()} ${data.brandName} по ${city} занимает 1 день при заказе до 18:00. Бесплатная доставка при заказе от 10 000 ₸. Также доступен самовывоз из пункта выдачи.`,
      },
      {
        question: `Оригинальные ли ${data.categoryName.toLowerCase()} ${data.brandName} в Ухтышке?`,
        answer: `Да, мы работаем только с официальными поставщиками ${data.brandName} и проверяем каждый товар перед отправкой. На все ${data.categoryName.toLowerCase()} ${data.brandName} предоставляется гарантия качества.`,
      },
    ]
  }

  /**
   * Массовая генерация SEO для всех комбинаций категория + бренд
   */
  async function generateSeoForAllCategoryBrands(options?: { dryRun?: boolean; overwrite?: boolean }) {
    const dryRun = options?.dryRun ?? true
    const overwrite = options?.overwrite ?? false

    // Получаем все комбинации категория + бренд с товарами
    const { data: combinations, error } = await supabase.rpc('get_category_brand_combinations')

    if (error) {
      console.error('Error fetching combinations:', error)
      return null
    }

    const results = []

    for (const combo of combinations || []) {
      const templateData: SeoTemplateData = {
        brandName: combo.brand_name,
        brandSlug: combo.brand_slug,
        categoryName: combo.category_name,
        categorySlug: combo.category_slug,
        productsCount: combo.products_count,
        minPrice: combo.min_price,
        maxPrice: combo.max_price,
        rating: combo.avg_rating,
        reviewsCount: combo.total_reviews,
      }

      const seoData = {
        category_id: combo.category_id,
        brand_id: combo.brand_id,
        seo_h1: generateBrandCategoryH1(templateData),
        seo_title: generateBrandCategoryTitle(templateData),
        seo_description: generateBrandCategoryDescription(templateData),
        seo_text: generateBrandCategorySeoText(templateData),
      }

      if (!dryRun) {
        if (overwrite) {
          // Принудительная перезапись всех полей (опасная операция)
          const { data: existing } = await supabase
            .from('category_brand_seo')
            .select('id')
            .eq('category_id', combo.category_id)
            .eq('brand_id', combo.brand_id)
            .single()

          if (existing) {
            const { error: updateError } = await supabase
              .from('category_brand_seo')
              .update(seoData)
              .eq('id', existing.id)
            if (updateError) {
              console.error(`Error updating SEO for ${combo.category_name} + ${combo.brand_name}:`, updateError)
            }
          }
          else {
            const { error: insertError } = await supabase.from('category_brand_seo').insert(seoData)
            if (insertError) {
              console.error(`Error inserting SEO for ${combo.category_name} + ${combo.brand_name}:`, insertError)
            }
          }
        }
        else {
          // Безопасный upsert через RPC (защищает уникальные тексты)
          const { data: result, error: rpcError } = await supabase.rpc('safe_upsert_category_brand_seo', {
            p_category_id: combo.category_id,
            p_brand_id: combo.brand_id,
            p_seo_h1: seoData.seo_h1,
            p_seo_title: seoData.seo_title,
            p_seo_description: seoData.seo_description,
            p_seo_text: seoData.seo_text,
          })

          if (rpcError) {
            console.error(`Error upserting SEO for ${combo.category_name} + ${combo.brand_name}:`, rpcError)
          }
          else if (result?.protected) {
            console.log(`Protected: ${combo.category_name} + ${combo.brand_name}`)
          }
        }
      }

      results.push({
        category: combo.category_name,
        brand: combo.brand_name,
        preview: seoData,
      })
    }

    return results
  }

  return {
    generateBrandCategorySeoText,
    generateBrandCategoryH1,
    generateBrandCategoryTitle,
    generateBrandCategoryDescription,
    generateBrandCategoryFaq,
    generateSeoForAllCategoryBrands,
  }
}
