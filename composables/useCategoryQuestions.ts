import type { Database } from '@/types'

export const useCategoryQuestions = () => {
  const supabase = useSupabaseClient<Database>()

  /**
   * Генерирует FAQ для категории:
   * - SQL: базовые вопросы (что входит, цены, бренды, доставка)
   * - AI: премиум вопросы для популярных категорий (>20 товаров)
   */
  async function generateQuestionsForCategory(categoryId: string) {
    // Шаг 1: Генерируем базовые вопросы через SQL
    const { data, error } = await supabase.rpc('generate_category_questions', {
      p_category_id: categoryId,
      p_skip_ai: false,
    })

    if (error) {
      console.error('Error generating basic questions:', error)
      return false
    }

    // Шаг 2: Если категория популярная - генерируем AI вопросы
    if (data && data.needs_ai) {
      console.log('Premium category detected, generating AI questions...')

      try {
        const response = await fetch(
          `${supabase.supabaseUrl}/functions/v1/generate-premium-questions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${supabase.supabaseKey}`,
            },
            body: JSON.stringify({
              entity_type: 'category',
              category_id: data.category_id,
              name: data.name,
              description: data.description,
              parent_category: data.parent_category,
              products_count: data.products_count,
              min_price: data.min_price,
              max_price: data.max_price,
              brands_count: data.brands_count,
            }),
          },
        )

        if (!response.ok) {
          console.error('AI generation failed:', await response.text())
        }
        else {
          const aiResult = await response.json()
          console.log(`AI generated ${aiResult.questions_count} premium questions`)
        }
      }
      catch (aiError) {
        console.error('AI generation error:', aiError)
      }
    }

    return true
  }

  /**
   * Генерирует БАЗОВЫЕ вопросы для всех активных категорий (МАССОВАЯ ОПЕРАЦИЯ)
   * AI-генерация пропускается, чтобы не расходовать токены
   */
  async function generateQuestionsForAllCategories() {
    const { data, error } = await supabase.rpc('generate_questions_for_all_categories')

    if (error) {
      console.error('Error generating questions for all categories:', error)
      return null
    }

    const premiumCount = data?.filter((item: any) => item.is_premium).length || 0
    console.log(`Generated questions for ${data?.length || 0} categories (${premiumCount} premium)`)

    return {
      total: data?.length || 0,
      premium_count: premiumCount,
      data,
    }
  }

  return {
    generateQuestionsForCategory,
    generateQuestionsForAllCategories,
  }
}
