import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

/**
 * Генерирует FAQ для страны производства
 */
export async function generateQuestionsForCountry(countryId: number) {
  const supabase = useSupabaseClient<Database>()
  const { data, error } = await supabase.rpc('generate_country_questions', {
    p_country_id: countryId,
    p_skip_ai: false,
  })

  if (error) {
    console.error('Error generating questions for country:', error)
    throw error
  }

  return data
}

/**
 * Генерирует FAQ для всех стран
 */
export async function generateQuestionsForAllCountries() {
  const supabase = useSupabaseClient<Database>()
  const { data, error } = await supabase.rpc('generate_questions_for_all_countries')

  if (error) {
    console.error('Error generating questions for all countries:', error)
    throw error
  }

  return data
}
