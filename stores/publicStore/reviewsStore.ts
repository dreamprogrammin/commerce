import type { Database } from '@/types'
import { defineStore } from 'pinia'
import { toast } from 'vue-sonner'
import { BUCKET_NAME_REVIEWS } from '@/constants'
import { optimizeImageBeforeUpload, shouldOptimizeImage } from '@/utils/imageOptimizer'
import { useAuthStore } from '../auth'

export interface ReviewImage {
  id: string
  image_url: string
  blur_placeholder: string | null
  display_order: number | null
}

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
  review_images: ReviewImage[]
  profiles: {
    first_name: string | null
    last_name: string | null
    avatar_url: string | null
  } | null
}

const REVIEW_SELECT = 'id, product_id, user_id, order_id, rating, text, is_published, created_at, updated_at, profiles!product_reviews_profile_id_fkey(first_name, last_name, avatar_url), review_images(id, image_url, blur_placeholder, display_order)'

export const useReviewsStore = defineStore('reviewsStore', () => {
  const supabase = useSupabaseClient<Database>()
  const authStore = useAuthStore()

  const reviews = ref<ProductReview[]>([])
  const isLoading = ref(false)

  async function fetchReviews(productId: string): Promise<ProductReview[]> {
    const { data, error } = await supabase
      .from('product_reviews')
      .select(REVIEW_SELECT)
      .eq('product_id', productId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })

    if (error)
      throw error
    reviews.value = (data as unknown as ProductReview[]) || []
    return reviews.value
  }

  async function submitReview(
    productId: string,
    rating: number,
    text: string,
    orderId?: string,
    imageFiles?: { file: File, blurPlaceholder?: string }[],
  ) {
    if (!authStore.isLoggedIn || !authStore.user?.id) {
      toast.info('Пожалуйста, авторизуйтесь, чтобы оставить отзыв.')
      return null
    }

    // 1. Создаём отзыв
    const { data, error } = await supabase
      .from('product_reviews')
      .insert({
        product_id: productId,
        user_id: authStore.user.id,
        rating,
        text: text.trim() || null,
        ...(orderId && { order_id: orderId }),
      })
      .select(REVIEW_SELECT)
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

    const review = data as unknown as ProductReview

    // 2. Загружаем фото (если есть)
    if (imageFiles?.length) {
      try {
        await uploadReviewImages(review.id, imageFiles)
      }
      catch (imgError: any) {
        console.error('Ошибка загрузки фото отзыва:', imgError)
        // Отзыв уже создан, просто предупреждаем
        toast.warning('Отзыв отправлен, но некоторые фото не удалось загрузить')
      }
    }

    toast.success('Ваш отзыв отправлен на модерацию!')
    return review
  }

  async function uploadReviewImages(
    reviewId: string,
    imageFiles: { file: File, blurPlaceholder?: string }[],
  ) {
    const uploadPromises = imageFiles.map(async ({ file, blurPlaceholder }, index) => {
      // Оптимизируем если нужно
      let fileToUpload = file
      let blur = blurPlaceholder || null

      if (shouldOptimizeImage(file)) {
        const result = await optimizeImageBeforeUpload(file)
        fileToUpload = result.file
        if (result.blurPlaceholder) {
          blur = result.blurPlaceholder
        }
      }

      // Загружаем в storage
      const ext = fileToUpload.name.split('.').pop() || 'webp'
      const fileName = `reviews/${reviewId}/${index}_${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_NAME_REVIEWS)
        .upload(fileName, fileToUpload, { contentType: fileToUpload.type })

      if (uploadError)
        throw uploadError

      // Создаём запись в review_images
      const { error: insertError } = await supabase
        .from('review_images')
        .insert({
          review_id: reviewId,
          image_url: fileName,
          blur_placeholder: blur,
          display_order: index,
        })

      if (insertError)
        throw insertError
    })

    await Promise.all(uploadPromises)
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
    // 1. Получаем пути фото для удаления из storage
    const { data: images } = await supabase
      .from('review_images')
      .select('image_url')
      .eq('review_id', reviewId)

    // 2. Удаляем отзыв (каскадно удалит review_images записи)
    const { error } = await supabase
      .from('product_reviews')
      .delete()
      .eq('id', reviewId)

    if (error) {
      toast.error('Ошибка при удалении отзыва', { description: error.message })
      return false
    }

    // 3. Удаляем файлы из storage
    if (images?.length) {
      const paths = images.map(img => img.image_url)
      await supabase.storage
        .from(BUCKET_NAME_REVIEWS)
        .remove(paths)
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
