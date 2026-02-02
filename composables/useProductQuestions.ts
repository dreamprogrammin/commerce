import type { Database } from '@/types'

export function useProductQuestions() {
  const supabase = useSupabaseClient<Database>()

  /**
   * Генерирует умные вопросы для товара:
   * - SQL: базовые вопросы (доставка, возраст, возврат)
   * - AI: премиум вопросы для товаров > 50000₸
   */
  async function generateQuestionsForProduct(productId: string) {
    // Шаг 1: Генерируем базовые вопросы через SQL
    const { data, error } = await supabase.rpc('generate_product_questions', {
      p_product_id: productId,
      p_skip_ai: false,
    })

    if (error) {
      console.error('Error generating basic questions:', error)
      return false
    }

    // Шаг 2: Если товар дорогой - генерируем AI вопросы
    if (data && data.needs_ai) {
      console.log('Premium product detected, generating AI questions...')

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
              product_id: data.product_id,
              name: data.name,
              price: data.price,
              description: data.description,
              brand: data.brand,
              material: data.material,
              country: data.country,
              category: data.category,
              min_age: data.min_age,
              max_age: data.max_age,
            }),
          },
        )

        if (!response.ok) {
          console.error('AI generation failed:', await response.text())
          // Не критично - базовые вопросы уже созданы
        }
        else {
          const aiResult = await response.json()
          console.log(`AI generated ${aiResult.questions_count} premium questions`)
        }
      }
      catch (aiError) {
        console.error('AI generation error:', aiError)
        // Не критично - базовые вопросы уже созданы
      }
    }

    return true
  }

  /**
   * Генерирует БАЗОВЫЕ вопросы для всех активных товаров (МАССОВАЯ ОПЕРАЦИЯ)
   * AI-генерация пропускается, чтобы не расходовать токены
   */
  async function generateQuestionsForAllProducts() {
    const { data, error } = await supabase.rpc('generate_questions_for_all_products')

    if (error) {
      console.error('Error generating questions for all products:', error)
      return null
    }

    // Подсчитываем премиум товары
    const premiumCount = data?.filter((item: any) => item.is_premium).length || 0
    console.log(`Generated questions for ${data?.length || 0} products (${premiumCount} premium)`)

    return {
      total: data?.length || 0,
      premium_count: premiumCount,
      data,
    }
  }

  return {
    generateQuestionsForProduct,
    generateQuestionsForAllProducts,
  }
}
