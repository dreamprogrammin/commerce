import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../core/useAuthStore'

export interface CategoryQuestion {
  id: string
  category_id: string
  user_id: string | null
  question_text: string
  answer_text: string | null
  answered_at: string | null
  is_auto_generated: boolean
  created_at: string
  profiles: {
    first_name: string | null
    last_name: string | null
  } | null
}

export const useCategoryQuestionsStore = defineStore('categoryQuestionsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const questions = ref<CategoryQuestion[]>([])
  const isLoading = ref(false)

  async function fetchQuestions(categoryId: string): Promise<CategoryQuestion[]> {
    const { data, error } = await supabase
      .from('category_questions')
      .select('id, category_id, user_id, question_text, answer_text, answered_at, is_auto_generated, created_at, profiles(first_name, last_name)')
      .eq('category_id', categoryId)
      .order('created_at', { ascending: false })

    if (error)
      throw error
    questions.value = (data as unknown as CategoryQuestion[]) || []
    return questions.value
  }

  async function askQuestion(categoryId: string, text: string) {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      toast.info('Пожалуйста, авторизуйтесь, чтобы задать вопрос.')
      return null
    }

    const { data, error } = await supabase
      .from('category_questions')
      .insert({
        category_id: categoryId,
        user_id: authStore.user.id,
        question_text: text.trim(),
      })
      .select('id, category_id, user_id, question_text, answer_text, answered_at, is_auto_generated, created_at, profiles(first_name, last_name)')
      .single()

    if (error) {
      toast.error('Ошибка при отправке вопроса', { description: error.message })
      return null
    }

    toast.success('Ваш вопрос отправлен!')
    return data as unknown as CategoryQuestion
  }

  async function deleteQuestion(questionId: string) {
    const { error } = await supabase
      .from('category_questions')
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
