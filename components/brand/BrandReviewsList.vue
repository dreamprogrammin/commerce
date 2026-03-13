<script setup lang="ts">
import type { Database } from '@/types'
import { MessageSquare, Star } from 'lucide-vue-next'
import StarRating from '@/components/product/StarRating.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_PRESETS } from '@/config/images'
import { BUCKET_NAME_REVIEWS } from '@/constants'

const props = defineProps<{
  brandId: string
  brandName: string
}>()

const supabase = useSupabaseClient<Database>()
const { getImageUrl } = useSupabaseStorage()

const PAGE_SIZE = 5

interface BrandReview {
  id: string
  rating: number
  comment: string | null
  created_at: string
  product_id: string
  product_name: string
  product_slug: string
  user_name: string
  user_avatar_url: string | null
  images: { id: string, image_url: string, blur_placeholder: string | null, display_order: number }[]
}

interface BrandStats {
  average_rating: number
  total_reviews_count: number
}

const reviews = ref<BrandReview[]>([])
const stats = ref<BrandStats | null>(null)
const isLoading = ref(false)
const hasMore = ref(true)
const offset = ref(0)

// Lightbox state
const lightboxOpen = ref(false)
const lightboxIndex = ref(0)
const lightboxImages = ref<BrandReview['images']>([])

async function loadStats() {
  const { data, error } = await supabase.rpc('get_brand_stats', {
    p_brand_id: props.brandId,
  })
  if (!error && data) {
    stats.value = data as unknown as BrandStats
  }
}

async function loadReviews(append = false) {
  if (isLoading.value)
    return
  isLoading.value = true

  try {
    const { data, error } = await supabase.rpc('get_reviews_by_brand', {
      p_brand_id: props.brandId,
      p_limit: PAGE_SIZE,
      p_offset: offset.value,
    })

    if (!error && data) {
      const fetched = data as unknown as BrandReview[]
      if (append) {
        reviews.value = [...reviews.value, ...fetched]
      }
      else {
        reviews.value = fetched
      }
      hasMore.value = fetched.length === PAGE_SIZE
      offset.value += fetched.length
    }
  }
  catch (err) {
    console.error('Error loading brand reviews:', err)
  }
  finally {
    isLoading.value = false
  }
}

function loadMore() {
  loadReviews(true)
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getThumbUrl(imageUrl: string) {
  return getImageUrl(BUCKET_NAME_REVIEWS, imageUrl, IMAGE_PRESETS.REVIEW_THUMB)
}

function getFullUrl(imageUrl: string) {
  return getImageUrl(BUCKET_NAME_REVIEWS, imageUrl, IMAGE_PRESETS.REVIEW_FULL)
}

function openLightbox(images: BrandReview['images'], index: number) {
  lightboxImages.value = images
  lightboxIndex.value = index
  lightboxOpen.value = true
}

function navigateLightbox(direction: number) {
  const next = lightboxIndex.value + direction
  if (next >= 0 && next < lightboxImages.value.length) {
    lightboxIndex.value = next
  }
}

// Загружаем при монтировании
onMounted(() => {
  loadStats()
  loadReviews()
})

defineExpose({ stats })
</script>

<template>
  <div v-if="stats && stats.total_reviews_count > 0" class="space-y-4 md:space-y-6">
    <!-- Заголовок с рейтингом -->
    <div class="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
      <h2 class="text-xl md:text-2xl font-bold flex items-center gap-2">
        <MessageSquare class="w-5 h-5 md:w-6 md:h-6 text-primary" />
        Отзывы о {{ brandName }}
      </h2>

      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <Star class="w-5 h-5 fill-yellow-400 text-yellow-400" />
          <span class="text-lg font-bold">{{ stats.average_rating }}</span>
        </div>
        <span class="text-sm text-muted-foreground">
          {{ stats.total_reviews_count }} {{ stats.total_reviews_count === 1 ? 'отзыв' : stats.total_reviews_count < 5 ? 'отзыва' : 'отзывов' }}
        </span>
      </div>
    </div>

    <!-- Список отзывов -->
    <div class="divide-y divide-border">
      <div
        v-for="review in reviews"
        :key="review.id"
        class="py-4 first:pt-0"
      >
        <div class="flex items-start gap-3">
          <!-- Аватар -->
          <div class="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
            <ProgressiveImage
              v-if="review.user_avatar_url"
              :src="review.user_avatar_url"
              :alt="review.user_name"
              object-fit="cover"
              placeholder-type="shimmer"
              class="w-full h-full"
            />
            <Icon v-else name="lucide:user" class="w-5 h-5 text-muted-foreground" />
          </div>

          <div class="flex-1 min-w-0">
            <!-- Имя + дата -->
            <div class="flex items-center justify-between gap-2 mb-1">
              <span class="font-medium text-sm">{{ review.user_name }}</span>
              <span class="text-xs text-muted-foreground shrink-0">{{ formatDate(review.created_at) }}</span>
            </div>

            <!-- Звёзды -->
            <StarRating :model-value="review.rating" readonly size="sm" class="mb-1.5" />

            <!-- О каком товаре -->
            <NuxtLink
              :to="`/catalog/products/${review.product_slug}`"
              class="text-xs text-primary hover:underline mb-2 inline-block"
            >
              {{ review.product_name }}
            </NuxtLink>

            <!-- Текст отзыва -->
            <p v-if="review.comment" class="text-sm text-foreground leading-relaxed">
              {{ review.comment }}
            </p>

            <!-- Фото отзыва -->
            <div v-if="review.images?.length" class="flex flex-wrap gap-2 mt-3">
              <button
                v-for="(img, idx) in review.images.slice(0, 5)"
                :key="img.id"
                class="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-lg overflow-hidden border hover:border-primary transition-colors cursor-pointer relative"
                @click="openLightbox(review.images, idx)"
              >
                <ProgressiveImage
                  :src="getThumbUrl(img.image_url)"
                  :blur-data-url="img.blur_placeholder"
                  :alt="`Фото ${idx + 1}`"
                  object-fit="cover"
                  :placeholder-type="img.blur_placeholder ? 'lqip' : 'shimmer'"
                  class="absolute inset-0"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Показать ещё -->
    <div v-if="hasMore" class="flex justify-center pt-2">
      <Button
        variant="outline"
        :disabled="isLoading"
        @click="loadMore"
      >
        <template v-if="isLoading">
          Загрузка...
        </template>
        <template v-else>
          Показать ещё отзывы
        </template>
      </Button>
    </div>

    <!-- Lightbox -->
    <Dialog v-model:open="lightboxOpen">
      <DialogContent class="max-w-3xl p-0 bg-black/95 border-none">
        <DialogTitle class="sr-only">
          Фото отзыва
        </DialogTitle>
        <div class="relative flex items-center justify-center min-h-[300px] sm:min-h-[500px]">
          <img
            v-if="lightboxImages[lightboxIndex]"
            :src="getFullUrl(lightboxImages[lightboxIndex].image_url) || ''"
            :alt="`Фото ${lightboxIndex + 1}`"
            class="max-h-[80vh] max-w-full object-contain"
          >

          <button
            v-if="lightboxIndex > 0"
            class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
            @click="navigateLightbox(-1)"
          >
            <Icon name="lucide:chevron-left" class="w-6 h-6 text-white" />
          </button>
          <button
            v-if="lightboxIndex < lightboxImages.length - 1"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
            @click="navigateLightbox(1)"
          >
            <Icon name="lucide:chevron-right" class="w-6 h-6 text-white" />
          </button>

          <div
            v-if="lightboxImages.length > 1"
            class="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-3 py-1 rounded-full"
          >
            {{ lightboxIndex + 1 }} / {{ lightboxImages.length }}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
