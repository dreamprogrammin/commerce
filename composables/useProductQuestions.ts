import type { Database } from '@/types'

export const useProductQuestions = () => {
  const supabase = useSupabaseClient<Database>()

  /**
   * Генерирует умные вопросы для товара на основе его характеристик
   */
  async function generateQuestionsForProduct(productId: string) {
    const { error } = await supabase.rpc('generate_product_questions', {
      p_product_id: productId,
    })

    if (error) {
      console.error('Error generating questions:', error)
      return false
    }

    return true
  }

  /**
   * Генерирует вопросы для всех активных товаров (МАССОВАЯ ОПЕРАЦИЯ)
   */
  async function generateQuestionsForAllProducts() {
    const { data, error } = await supabase.rpc('generate_questions_for_all_products')

    if (error) {
      console.error('Error generating questions for all products:', error)
      return null
    }

    return data
  }

  return {
    generateQuestionsForProduct,
    generateQuestionsForAllProducts,
  }
}
