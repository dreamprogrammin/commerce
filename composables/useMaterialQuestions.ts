import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Генерирует FAQ для материала
 */
export async function generateQuestionsForMaterial(materialId: number) {
  const supabase = useSupabaseClient<Database>()
  const { data, error } = await supabase.rpc('generate_material_questions', {
    p_material_id: materialId,
    p_skip_ai: false,
  })

  if (error) {
    console.error('Error generating questions for material:', error)
    throw error
  }

  return data
}

/**
 * Генерирует FAQ для всех материалов
 */
export async function generateQuestionsForAllMaterials() {
  const supabase = useSupabaseClient<Database>()
  const { data, error } = await supabase.rpc('generate_questions_for_all_materials')

  if (error) {
    console.error('Error generating questions for all materials:', error)
    throw error
  }

  return data
}
