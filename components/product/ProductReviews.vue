<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useReviewsStore } from '@/stores/publicStore/reviewsStore'
import StarRating from './StarRating.vue'
import ReviewCard from './ReviewCard.vue'

const props = defineProps<{
  productId: string
  avgRating?: number
  reviewCount?: number
}>()

const reviewsStore = useReviewsStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const queryClient = useQueryClient()

const reviewText = ref('')
const reviewRating = ref(0)
const isSubmitting = ref(false)
const isFormOpen = ref(false)
const showAll = ref(false)

const { data: reviews, isLoading } = useQuery({
  queryKey: ['product-reviews', () => props.productId],
  queryFn: () => reviewsStore.fetchReviews(props.productId),
  staleTime: 2 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: true,
})

const { data: canReview } = useQuery({
  queryKey: ['can-review', () => props.productId],
  queryFn: () => reviewsStore.canReview(props.productId),
  staleTime: 5 * 60 * 1000,
  enabled: computed(() => authStore.isLoggedIn),
})

const displayedReviews = computed(() => {
  if (!reviews.value)
    return []
  return showAll.value ? reviews.value : reviews.value.slice(0, 3)
})

// Распределение по звёздам
const ratingDistribution = computed(() => {
  if (!reviews.value?.length)
    return []
  const counts = [0, 0, 0, 0, 0]
  reviews.value.forEach(r => counts[r.rating - 1]++)
  const total = reviews.value.length
  return [5, 4, 3, 2, 1].map(stars => ({
    stars,
    count: counts[stars - 1],
    percentage: total ? Math.round((counts[stars - 1] / total) * 100) : 0,
  }))
})

function openReviewForm() {
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal()
    return
  }
  isFormOpen.value = true
}

async function submitReview() {
  if (reviewRating.value === 0)
    return

  isSubmitting.value = true
  const result = await reviewsStore.submitReview(
    props.productId,
    reviewRating.value,
    reviewText.value,
  )
  isSubmitting.value = false

  if (result) {
    reviewText.value = ''
    reviewRating.value = 0
    isFormOpen.value = false
    queryClient.invalidateQueries({ queryKey: ['product-reviews', props.productId] })
    queryClient.invalidateQueries({ queryKey: ['can-review', props.productId] })
  }
}

async function handleDelete(reviewId: string) {
  const success = await reviewsStore.deleteReview(reviewId)
  if (success) {
    queryClient.invalidateQueries({ queryKey: ['product-reviews', props.productId] })
    queryClient.invalidateQueries({ queryKey: ['can-review', props.productId] })
  }
}

// Scroll to reviews section from notification anchor
onMounted(() => {
  if (window.location.hash === '#reviews') {
    nextTick(() => {
      document.getElementById('reviews')?.scrollIntoView({ behavior: 'smooth' })
    })
  }
})
</script>

<template>
  <div id="reviews" class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border scroll-mt-20">
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg lg:text-xl font-bold">
        Отзывы
        <span v-if="reviewCount" class="text-muted-foreground font-normal text-base">
          ({{ reviewCount }})
        </span>
      </h2>
      <Button
        v-if="canReview && !isFormOpen"
        size="sm"
        @click="openReviewForm"
      >
        <Icon name="lucide:message-square-plus" class="w-4 h-4 mr-1" />
        Оставить отзыв
      </Button>
    </div>

    <!-- Средний рейтинг + распределение -->
    <div v-if="reviews?.length" class="flex flex-col sm:flex-row gap-6 mb-6 pb-6 border-b">
      <!-- Средний рейтинг -->
      <div class="text-center sm:text-left">
        <div class="text-4xl font-bold text-foreground">
          {{ (avgRating || 0).toFixed(1) }}
        </div>
        <StarRating :model-value="avgRating || 0" readonly size="md" class="mt-1" />
        <div class="text-sm text-muted-foreground mt-1">
          {{ reviewCount }} {{ reviewCount === 1 ? 'отзыв' : (reviewCount && reviewCount >= 2 && reviewCount <= 4) ? 'отзыва' : 'отзывов' }}
        </div>
      </div>

      <!-- Распределение по звёздам -->
      <div class="flex-1 space-y-1.5">
        <div v-for="item in ratingDistribution" :key="item.stars" class="flex items-center gap-2 text-sm">
          <span class="w-4 text-right text-muted-foreground">{{ item.stars }}</span>
          <Icon name="lucide:star" class="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
          <div class="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              class="h-full bg-yellow-400 rounded-full transition-all duration-300"
              :style="{ width: `${item.percentage}%` }"
            />
          </div>
          <span class="w-8 text-right text-muted-foreground">{{ item.count }}</span>
        </div>
      </div>
    </div>

    <!-- Форма отзыва -->
    <div v-if="isFormOpen" class="mb-6 p-4 bg-muted/50 rounded-lg border">
      <h3 class="font-medium mb-3">
        Ваш отзыв
      </h3>
      <div class="mb-3">
        <label class="text-sm text-muted-foreground mb-1 block">Оценка</label>
        <StarRating v-model="reviewRating" size="lg" />
      </div>
      <Textarea
        v-model="reviewText"
        placeholder="Расскажите о вашем опыте использования товара..."
        class="mb-3"
        :rows="3"
      />
      <div class="flex gap-2">
        <Button
          :disabled="reviewRating === 0 || isSubmitting"
          @click="submitReview"
        >
          {{ isSubmitting ? 'Отправка...' : 'Отправить отзыв' }}
        </Button>
        <Button
          variant="outline"
          @click="isFormOpen = false"
        >
          Отмена
        </Button>
      </div>
    </div>

    <!-- Загрузка -->
    <div v-if="isLoading" class="py-8 text-center">
      <div class="w-8 h-8 mx-auto border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>

    <!-- Список отзывов -->
    <div v-else-if="reviews?.length">
      <ReviewCard
        v-for="review in displayedReviews"
        :key="review.id"
        :review="review"
        :can-delete="review.user_id === authStore.user?.id"
        @delete="handleDelete"
      />

      <button
        v-if="!showAll && reviews.length > 3"
        class="mt-4 text-sm text-primary hover:underline"
        @click="showAll = true"
      >
        Показать все отзывы ({{ reviews.length }})
      </button>
    </div>

    <!-- Пусто -->
    <div v-else class="py-8 text-center">
      <Icon name="lucide:message-square" class="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
      <p class="text-muted-foreground">
        Пока нет отзывов
      </p>
      <p v-if="canReview" class="text-sm text-muted-foreground mt-1">
        Будьте первым, кто оставит отзыв!
      </p>
      <Button
        v-if="canReview && !isFormOpen"
        variant="outline"
        size="sm"
        class="mt-3"
        @click="openReviewForm"
      >
        Оставить отзыв
      </Button>
    </div>
  </div>
</template>
