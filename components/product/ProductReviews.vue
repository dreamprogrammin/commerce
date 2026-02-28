<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useReviewsStore } from '@/stores/publicStore/reviewsStore'
import { optimizeImageBeforeUpload, shouldOptimizeImage } from '@/utils/imageOptimizer'
import ReviewCard from './ReviewCard.vue'
import StarRating from './StarRating.vue'

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

// Фото
const MAX_IMAGES = 5
const imageFiles = ref<{ file: File, preview: string, blurPlaceholder?: string }[]>([])
const isOptimizing = ref(false)

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

async function handleImageSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files)
    return

  const remaining = MAX_IMAGES - imageFiles.value.length
  const toAdd = Array.from(files).slice(0, remaining)

  isOptimizing.value = true
  for (const file of toAdd) {
    let processedFile = file
    let blur: string | undefined

    if (shouldOptimizeImage(file)) {
      const result = await optimizeImageBeforeUpload(file)
      processedFile = result.file
      blur = result.blurPlaceholder || undefined
    }

    const preview = URL.createObjectURL(processedFile)
    imageFiles.value.push({ file: processedFile, preview, blurPlaceholder: blur })
  }
  isOptimizing.value = false

  // Сброс input
  input.value = ''
}

function removeImage(index: number) {
  const removed = imageFiles.value.splice(index, 1)
  if (removed[0]) {
    URL.revokeObjectURL(removed[0].preview)
  }
}

async function submitReview() {
  if (reviewRating.value === 0)
    return

  isSubmitting.value = true

  const images = imageFiles.value.length
    ? imageFiles.value.map(img => ({ file: img.file, blurPlaceholder: img.blurPlaceholder }))
    : undefined

  const result = await reviewsStore.submitReview(
    props.productId,
    reviewRating.value,
    reviewText.value,
    undefined,
    images,
  )
  isSubmitting.value = false

  if (result) {
    // Cleanup
    imageFiles.value.forEach(img => URL.revokeObjectURL(img.preview))
    imageFiles.value = []
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

onUnmounted(() => {
  imageFiles.value.forEach(img => URL.revokeObjectURL(img.preview))
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

      <!-- Загрузка фото -->
      <div class="mb-3">
        <label class="text-sm text-muted-foreground mb-2 block">
          Фото ({{ imageFiles.length }} / {{ MAX_IMAGES }})
        </label>

        <!-- Превью загруженных -->
        <div v-if="imageFiles.length" class="flex flex-wrap gap-2 mb-2">
          <div
            v-for="(img, idx) in imageFiles"
            :key="idx"
            class="relative w-20 h-20 rounded-lg overflow-hidden border group"
          >
            <img :src="img.preview" :alt="`Фото ${idx + 1}`" class="w-full h-full object-cover">
            <button
              class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
              @click="removeImage(idx)"
            >
              <Icon name="lucide:x" class="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <!-- Кнопка добавления -->
        <label
          v-if="imageFiles.length < MAX_IMAGES"
          class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg cursor-pointer hover:bg-muted transition-colors"
          :class="{ 'opacity-50 pointer-events-none': isOptimizing }"
        >
          <Icon name="lucide:camera" class="w-4 h-4" />
          <span>{{ isOptimizing ? 'Оптимизация...' : 'Добавить фото' }}</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            class="hidden"
            @change="handleImageSelect"
          >
        </label>
      </div>

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
