import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { useAuthStore } from '../auth'

export interface ProductReview {
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
}

export const useReviewsStore = defineStore('reviewsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const reviews = ref<ProductReview[]>([])
  const isLoading = ref(false)

  async function fetchReviews(productId: string): Promise<ProductReview[]> {
    const { data, error } = await supabase
      .from('product_reviews')
      .select('id, product_id, user_id, order_id, rating, text, is_published, created_at, updated_at, profiles!product_reviews_user_id_fkey(first_name, last_name, avatar_url)')
      .eq('product_id', productId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error)
      throw error
    reviews.value = (data as unknown as ProductReview[]) || []
    return reviews.value
  }

  async function submitReview(productId: string, rating: number, text: string, orderId?: string) {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      toast.info('Пожалуйста, авторизуйтесь, чтобы оставить отзыв.')
      return null
    }

    const { data, error } = await supabase
      .from('product_reviews')
      .insert({
        product_id: productId,
        user_id: authStore.user.id,
        rating,
        text: text.trim() || null,
        ...(orderId && { order_id: orderId }),
      })
      .select('id, product_id, user_id, order_id, rating, text, is_published, created_at, updated_at, profiles!product_reviews_user_id_fkey(first_name, last_name, avatar_url)')
      .single()

    if (error) {
      if (error.code === '23505') {
        toast.error('Вы уже оставляли отзыв на этот товар')
      }
      else {
        toast.error('Ошибка при отправке отзыва', { description: error.message })
      }
      return null
    }

    toast.success('Ваш отзыв отправлен на модерацию!')
    return data as unknown as ProductReview
  }

  async function canReview(productId: string): Promise<boolean> {
    if (!authStore.isLoggedIn || !authStore.user?.id)
      return false

    // Проверяем: купил товар И ещё не писал отзыв
    const [orderCheck, reviewCheck] = await Promise.all([
      supabase
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .in('order_id', supabase
          .from('orders')
          .select('id')
          .eq('user_id', authStore.user.id)
          .in('status', ['delivered', 'completed']) as any),
      supabase
        .from('product_reviews')
        .select('id', { count: 'exact', head: true })
        .eq('product_id', productId)
        .eq('user_id', authStore.user.id),
    ])

    const hasPurchased = (orderCheck.count ?? 0) > 0
    const hasReviewed = (reviewCheck.count ?? 0) > 0

    return hasPurchased && !hasReviewed
  }

  async function deleteReview(reviewId: string) {
    const { error } = await supabase
      .from('product_reviews')
      .delete()
      .eq('id', reviewId)

    if (error) {
      toast.error('Ошибка при удалении отзыва', { description: error.message })
      return false
    }

    reviews.value = reviews.value.filter(r => r.id !== reviewId)
    toast.success('Отзыв удалён')
    return true
  }

  return {
    reviews,
    isLoading,
    fetchReviews,
    submitReview,
    canReview,
    deleteReview,
  }
})
