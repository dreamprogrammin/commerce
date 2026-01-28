import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'

export interface AdminQuestion {
  id: string
  product_id: string
  user_id: string
  question_text: string
  answer_text: string | null
  answered_by: string | null
  answered_at: string | null
  is_published: boolean
  created_at: string
  updated_at: string
  profiles: {
    full_name: string | null
  } | null
  products: {
    name: string
    slug: string
  } | null
}

export const useAdminQuestionsStore = defineStore('adminQuestionsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const questions = ref<AdminQuestion[]>([])
  const isLoading = ref(false)
  const unansweredCount = ref(0)

  const selectQuery = 'id, product_id, user_id, question_text, answer_text, answered_by, answered_at, is_published, created_at, updated_at, profiles:user_id(full_name), products:product_id(name, slug)'

  async function fetchAllQuestions(filter: 'all' | 'unanswered' = 'all') {
    isLoading.value = true
    try {
      let query = supabase
        .from('product_questions')
        .select(selectQuery)
        .order('created_at', { ascending: false })

      if (filter === 'unanswered') {
        query = query.is('answer_text', null)
      }

      const { data, error } = await query
      if (error)
        throw error
      questions.value = (data as unknown as AdminQuestion[]) || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки вопросов', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchUnansweredCount() {
    const { count, error } = await supabase
      .from('product_questions')
      .select('id', { count: 'exact', head: true })
      .is('answer_text', null)
      .eq('is_published', true)

    if (!error) {
      unansweredCount.value = count || 0
    }
  }

  async function answerQuestion(questionId: string, answerText: string) {
    const user = useSupabaseUser()
    const { error } = await supabase
      .from('product_questions')
      .update({
        answer_text: answerText.trim(),
        answered_by: user.value?.id,
        answered_at: new Date().toISOString(),
      })
      .eq('id', questionId)

    if (error) {
      toast.error('Ошибка при ответе', { description: error.message })
      return false
    }

    const q = questions.value.find(q => q.id === questionId)
    if (q) {
      q.answer_text = answerText.trim()
      q.answered_at = new Date().toISOString()
    }
    unansweredCount.value = Math.max(0, unansweredCount.value - 1)
    toast.success('Ответ сохранён')
    return true
  }

  async function togglePublished(questionId: string) {
    const q = questions.value.find(q => q.id === questionId)
    if (!q)
      return false

    const { error } = await supabase
      .from('product_questions')
      .update({ is_published: !q.is_published })
      .eq('id', questionId)

    if (error) {
      toast.error('Ошибка обновления', { description: error.message })
      return false
    }

    q.is_published = !q.is_published
    toast.success(q.is_published ? 'Вопрос опубликован' : 'Вопрос скрыт')
    return true
  }

  async function deleteQuestion(questionId: string) {
    const { error } = await supabase
      .from('product_questions')
      .delete()
      .eq('id', questionId)

    if (error) {
      toast.error('Ошибка удаления', { description: error.message })
      return false
    }

    questions.value = questions.value.filter(q => q.id !== questionId)
    toast.success('Вопрос удалён')
    return true
  }

  return {
    questions,
    isLoading,
    unansweredCount,
    fetchAllQuestions,
    fetchUnansweredCount,
    answerQuestion,
    togglePublished,
    deleteQuestion,
  }
})
