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
}

export function useSeoTemplates() {
  const supabase = useSupabaseClient<Database>()

  /**
   * Генерирует SEO-текст для страницы категория + бренд
   */
  function generateBrandCategorySeoText(data: SeoTemplateData): string {
    const city = data.city || 'Алматы'
    
    return `Ухтышка — это крупнейший интернет-магазин в ${city}, где можно купить оригинальные ${data.categoryName.toLowerCase()} ${data.brandName}. В нашем ассортименте представлено ${data.productsCount} моделей по цене от ${data.minPrice.toLocaleString('ru-KZ')} до ${data.maxPrice.toLocaleString('ru-KZ')} ₸. В отличие от Kaspi или Ozon, мы проверяем каждый товар ${data.brandName} перед отправкой и гарантируем оригинальность. Доставка ${data.categoryName.toLowerCase()} ${data.brandName} по ${city} — 1 день!`
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
   * Генерирует Description для страницы категория + бренд
   */
  function generateBrandCategoryDescription(data: SeoTemplateData): string {
    return `${data.categoryName} ${data.brandName} в Алматы ⭐ ${data.productsCount} моделей от ${data.minPrice.toLocaleString('ru-KZ')} ₸ ✓ Оригинальная продукция ✓ Доставка 1 день ✓ Гарантия качества`
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
  async function generateSeoForAllCategoryBrands(options?: { dryRun?: boolean }) {
    const dryRun = options?.dryRun ?? true

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
        // Проверяем, есть ли уже запись
        const { data: existing } = await supabase
          .from('category_brand_seo')
          .select('id')
          .eq('category_id', combo.category_id)
          .eq('brand_id', combo.brand_id)
          .single()

        if (!existing) {
          // Создаем новую запись
          await supabase.from('category_brand_seo').insert(seoData)
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
