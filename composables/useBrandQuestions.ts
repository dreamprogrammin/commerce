import type { Database } from '@/types'

export function useBrandQuestions() {
  const supabase = useSupabaseClient<Database>()

  /**
   * Генерирует FAQ для бренда:
   * - SQL: базовые вопросы (о бренде, категории, страна, цены, доставка)
   * - AI: премиум вопросы для популярных брендов (>15 товаров)
   */
  async function generateQuestionsForBrand(brandId: string) {
    // Шаг 1: Генерируем базовые вопросы через SQL
    const { data, error } = await supabase.rpc('generate_brand_questions', {
      p_brand_id: brandId,
      p_skip_ai: false,
    })

    if (error) {
      console.error('Error generating basic questions:', error)
      return false
    }

    // Шаг 2: Если бренд популярный - генерируем AI вопросы
    if (data && data.needs_ai) {
      console.log('Premium brand detected, generating AI questions...')

      // Токен текущего пользователя, не анонимный ключ — см. useProductQuestions.ts.
      try {
        const { data: aiResult, error: fnError } = await supabase.functions.invoke<{ questions_count: number }>(
          'generate-premium-questions',
          {
            body: {
              entity_type: 'brand',
              brand_id: data.brand_id,
              name: data.name,
              description: data.description,
              products_count: data.products_count,
              min_price: data.min_price,
              max_price: data.max_price,
              categories_count: data.categories_count,
              country: data.country,
            },
          },
        )

        if (fnError) {
          console.error('AI generation failed:', fnError)
        }
        else {
          console.log(`AI generated ${aiResult?.questions_count} premium questions`)
        }
      }
      catch (aiError) {
        console.error('AI generation error:', aiError)
      }
    }

    return true
  }

  /**
   * Генерирует БАЗОВЫЕ вопросы для всех брендов (МАССОВАЯ ОПЕРАЦИЯ)
   * AI-генерация пропускается, чтобы не расходовать токены
   */
  async function generateQuestionsForAllBrands() {
    const { data, error } = await supabase.rpc('generate_questions_for_all_brands')

    if (error) {
      console.error('Error generating questions for all brands:', error)
      return null
    }

    const premiumCount = data?.filter((item: any) => item.is_premium).length || 0
    console.log(`Generated questions for ${data?.length || 0} brands (${premiumCount} premium)`)

    return {
      total: data?.length || 0,
      premium_count: premiumCount,
      data,
    }
  }

  return {
    generateQuestionsForBrand,
    generateQuestionsForAllBrands,
  }
}
