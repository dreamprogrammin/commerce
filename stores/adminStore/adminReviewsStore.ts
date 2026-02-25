import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'

export interface AdminReview {
  id: string
  product_id: string
  user_id: string
  order_id: string | null
  rating: number
  text: string | null
  is_published: boolean
  created_at: string
  updated_at: string
  profiles: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  } | null
  products: {
    name: string
    slug: string
  } | null
}

export const useAdminReviewsStore = defineStore('adminReviewsStore', () => {
  const supabase = useSupabaseClient<Database>()

  const reviews = ref<AdminReview[]>([])
  const isLoading = ref(false)
  const unpublishedCount = ref(0)

  const selectQuery = 'id, product_id, user_id, order_id, rating, text, is_published, created_at, updated_at, profiles!product_reviews_user_id_fkey(first_name, last_name, avatar_url), products!product_reviews_product_id_fkey(name, slug)'

  async function fetchAllReviews(filter: 'all' | 'unpublished' = 'unpublished') {
    isLoading.value = true
    try {
      let query = supabase
        .from('product_reviews')
        .select(selectQuery)
        .order('created_at', { ascending: false })

      if (filter === 'unpublished') {
        query = query.eq('is_published', false)
      }

      const { data, error } = await query
      if (error)
        throw error
      reviews.value = (data as unknown as AdminReview[]) || []
    }
    catch (error: any) {
      toast.error('Ошибка загрузки отзывов', { description: error.message })
    }
    finally {
      isLoading.value = false
    }
  }

  async function fetchUnpublishedCount() {
    const { count, error } = await supabase
      .from('product_reviews')
      .select('id', { count: 'exact', head: true })
      .eq('is_published', false)

    if (!error) {
      unpublishedCount.value = count || 0
    }
  }

  async function togglePublished(reviewId: string) {
    const r = reviews.value.find(r => r.id === reviewId)
    if (!r)
      return false

    const { error } = await supabase
      .from('product_reviews')
      .update({
        is_published: !r.is_published,
        updated_at: new Date().toISOString(),
      })
      .eq('id', reviewId)

    if (error) {
      toast.error('Ошибка обновления', { description: error.message })
      return false
    }

    r.is_published = !r.is_published
    toast.success(r.is_published ? 'Отзыв опубликован' : 'Отзыв скрыт')
    return true
  }

  async function deleteReview(reviewId: string) {
    const { error } = await supabase
      .from('product_reviews')
      .delete()
      .eq('id', reviewId)

    if (error) {
      toast.error('Ошибка удаления', { description: error.message })
      return false
    }

    reviews.value = reviews.value.filter(r => r.id !== reviewId)
    toast.success('Отзыв удалён')
    return true
  }

  return {
    reviews,
    isLoading,
    unpublishedCount,
    fetchAllReviews,
    fetchUnpublishedCount,
    togglePublished,
    deleteReview,
  }
})
