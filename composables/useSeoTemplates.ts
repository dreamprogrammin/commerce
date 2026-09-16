import type { Database } from '@/types'
import { FREE_SHIPPING_LABEL } from '@/constants/homePlaceholders'
import { clampDescription, formatPriceRu, MIN_REVIEWS_FOR_SNIPPET, pluralRu } from '@/utils/seoDescription'

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

  /*
   * `generateCategoryDescription` ЖИЛ ЗДЕСЬ и удалён 2 сентября 2026.
   *
   * Он собирал мета-описание категории с эмодзи впереди («💰 От 6 190 ₸»)
   * и рядом звёзд, набранных иногда с единственного отзыва. Search Console
   * за 90 дней по страницам категорий на позициях до десятой: 238 показов,
   * ноль кликов.
   *
   * Замена — `composeCategoryMeta` в `utils/seoDescription.ts`: факты
   * вперёд (сколько моделей и от какой цены), без эмодзи, с настоящим
   * числом товаров по всей ветке категорий. Там же тесты.
   */

  /**
   * Description для страницы «категория + бренд».
   *
   * Переписан 15 сентября 2026 по тем же правилам, что `composeCategoryMeta`
   * для категорий (см. разбор там же). Прежний шаблон открывался эмодзи
   * «💰 Цены от…», добавлял ряд звёзд, набранных иногда с единственного
   * отзыва, и заканчивался призывом «Заказывайте оригиналы!». Мобильная
   * выдача режет описание около 120 знаков, и до фактов дело не доходило.
   *
   * Плюс он обещал доставку «за 1 день», чего магазин не делает: по
   * опубликованным условиям это 1–3 рабочих дня по Алматы.
   */
  function generateBrandCategoryDescription(data: SeoTemplateData): string {
    const parts = [`${data.categoryName} ${data.brandName} в ${data.city || 'Алматы'}`]

    if (data.productsCount > 0) {
      parts[0] += `: ${data.productsCount} ${pluralRu(data.productsCount, 'модель', 'модели', 'моделей')}`
    }
    if (data.minPrice > 0) {
      parts[0] += ` от ${formatPriceRu(data.minPrice)} ₸`
    }

    parts.push('Доставка 1–3 дня, самовывоз')

    if (data.rating && (data.reviewsCount ?? 0) >= MIN_REVIEWS_FOR_SNIPPET) {
      parts.push(
        `рейтинг ${data.rating.toFixed(1).replace('.', ',')} из 5 по ${data.reviewsCount} ${pluralRu(data.reviewsCount!, 'отзыву', 'отзывам', 'отзывам')}`,
      )
    }

    return clampDescription(`${parts.join('. ')}.`)
  }

  /**
   * Генерирует FAQ для страницы категория + бренд
   */
  function generateBrandCategoryFaq(data: SeoTemplateData) {
    const city = data.city || 'Алматы'

    return [
      {
        question: `Где купить ${data.categoryName.toLowerCase()} ${data.brandName} в ${city}?`,
        answer: `Лучший выбор ${data.categoryName.toLowerCase()} ${data.brandName} в ${city} представлен в специализированном интернет-магазине Ухтышка (uhti.kz). Мы предлагаем ${data.productsCount} моделей с бесплатной доставкой от ${FREE_SHIPPING_LABEL} и начислением бонусов на следующую покупку.`,
      },
      {
        question: `Сколько стоят ${data.categoryName.toLowerCase()} ${data.brandName}?`,
        answer: `Цены на ${data.categoryName.toLowerCase()} ${data.brandName} в Ухтышке начинаются от ${data.minPrice.toLocaleString('ru-KZ')} ₸. Самые популярные модели стоят от ${Math.round(data.minPrice * 1.5).toLocaleString('ru-KZ')} до ${Math.round(data.maxPrice * 0.7).toLocaleString('ru-KZ')} ₸.`,
      },
      {
        question: `Как быстро доставят ${data.categoryName.toLowerCase()} ${data.brandName} в ${city}?`,
        // Срок — из опубликованных условий `/terms`: по Алматы 1–3 рабочих дня.
        // Стояло «1 день при заказе до 18:00»: и срок неверный, и условие про
        // 18:00 нигде не опубликовано. Та же формулировка сидела в функции
        // `generate_category_brand_faq` и разошлась по 13 ответам в базе —
        // починено миграцией 20260916130000.
        answer: `Доставка ${data.categoryName.toLowerCase()} ${data.brandName} по ${city} занимает 1–3 рабочих дня. Бесплатная доставка при заказе от ${FREE_SHIPPING_LABEL}. Также доступен самовывоз из пункта выдачи.`,
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
  async function generateSeoForAllCategoryBrands(options?: { dryRun?: boolean, overwrite?: boolean }) {
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
