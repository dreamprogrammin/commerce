import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../auth'

export interface ProductQuestion {
  id: string
  product_id: string
  user_id: string
  question_text: string
  answer_text: string | null
  answered_at: string | null
  is_published: boolean
  created_at: string
  profiles: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export const useProductQuestionsStore = defineStore('productQuestionsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const questions = ref<ProductQuestion[]>([])
  const isLoading = ref(false)

  async function fetchQuestions(productId: string): Promise<ProductQuestion[]> {
    const { data, error } = await supabase
      .from('product_questions')
      .select('id, product_id, user_id, question_text, answer_text, answered_at, is_published, created_at, profiles:user_id(full_name, avatar_url)')
      .eq('product_id', productId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error)
      throw error
    questions.value = (data as unknown as ProductQuestion[]) || []
    return questions.value
  }

  async function askQuestion(productId: string, text: string) {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      toast.info('Пожалуйста, авторизуйтесь, чтобы задать вопрос.')
      return null
    }

    const { data, error } = await supabase
      .from('product_questions')
      .insert({
        product_id: productId,
        user_id: authStore.user.id,
        question_text: text.trim(),
      })
      .select('id, product_id, user_id, question_text, answer_text, answered_at, is_published, created_at, profiles:user_id(full_name, avatar_url)')
      .single()

    if (error) {
      toast.error('Ошибка при отправке вопроса', { description: error.message })
      return null
    }

    toast.success('Ваш вопрос отправлен!')
    return data as unknown as ProductQuestion
  }

  async function deleteQuestion(questionId: string) {
    const { error } = await supabase
      .from('product_questions')
      .delete()
      .eq('id', questionId)

    if (error) {
      toast.error('Ошибка при удалении вопроса', { description: error.message })
      return false
    }

    questions.value = questions.value.filter(q => q.id !== questionId)
    toast.success('Вопрос удалён')
    return true
  }

  return {
    questions,
    isLoading,
    fetchQuestions,
    askQuestion,
    deleteQuestion,
  }
})
