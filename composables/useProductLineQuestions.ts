import type { Database } from '@/types/supabase'

/**
 * Генерирует FAQ для линейки продуктов
 */
export async function generateQuestionsForProductLine(productLineId: string) {
  const supabase = useSupabaseClient<Database>()
  const { data, error } = await supabase.rpc('generate_product_line_questions', {
    p_product_line_id: productLineId,
    p_skip_ai: false,
  })

  if (error) {
    console.error('Error generating questions for product line:', error)
    throw error
  }

  return data
}

/**
 * Генерирует FAQ для всех линеек продуктов
 */
export async function generateQuestionsForAllProductLines() {
  const supabase = useSupabaseClient<Database>()
  const { data, error } = await supabase.rpc('generate_questions_for_all_product_lines')

  if (error) {
    console.error('Error generating questions for all product lines:', error)
    throw error
  }

  return data
}
