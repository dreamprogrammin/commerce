<script setup lang="ts">
import type { ProductReview } from '@/stores/publicStore/reviewsStore'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_PRESETS } from '@/config/images'
import { BUCKET_NAME_REVIEWS } from '@/constants'
import StarRating from './StarRating.vue'

defineProps<{
  review: ProductReview
  canDelete?: boolean
}>()

const emit = defineEmits<{
  delete: [id: string]
}>()

const { getImageUrl } = useSupabaseStorage()

const lightboxOpen = ref(false)
const lightboxIndex = ref(0)

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getAuthorName(review: ProductReview): string {
  const profile = review.profiles
  if (!profile)
    return 'Покупатель'
  const parts = [profile.first_name, profile.last_name].filter(Boolean)
  return parts.length ? parts.join(' ') : 'Покупатель'
}

function getThumbUrl(imageUrl: string) {
  return getImageUrl(BUCKET_NAME_REVIEWS, imageUrl, IMAGE_PRESETS.REVIEW_THUMB)
}

function getFullUrl(imageUrl: string) {
  return getImageUrl(BUCKET_NAME_REVIEWS, imageUrl, IMAGE_PRESETS.REVIEW_FULL)
}

function openLightbox(index: number) {
  lightboxIndex.value = index
  lightboxOpen.value = true
}

function navigateLightbox(direction: number, images: ProductReview['review_images']) {
  const next = lightboxIndex.value + direction
  if (next >= 0 && next < images.length) {
    lightboxIndex.value = next
  }
}
</script>

<template>
  <div class="py-4 border-b last:border-b-0">
    <div class="flex items-start gap-3">
      <!-- Аватар -->
      <div class="shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
        <img
          v-if="review.profiles?.avatar_url"
          :src="review.profiles.avatar_url"
          :alt="getAuthorName(review)"
          class="w-full h-full object-cover"
        >
        <Icon v-else name="lucide:user" class="w-5 h-5 text-muted-foreground" />
      </div>

      <div class="flex-1 min-w-0">
        <!-- Имя + дата -->
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="font-medium text-sm">{{ getAuthorName(review) }}</span>
          <span class="text-xs text-muted-foreground shrink-0">{{ formatDate(review.created_at) }}</span>
        </div>

        <!-- Звёзды -->
        <StarRating :model-value="review.rating" readonly size="sm" class="mb-2" />

        <!-- Текст отзыва -->
        <p v-if="review.text" class="text-sm text-foreground leading-relaxed">
          {{ review.text }}
        </p>

        <!-- Фото отзыва -->
        <div v-if="review.review_images?.length" class="flex flex-wrap gap-2 mt-3">
          <button
            v-for="(img, idx) in review.review_images.slice(0, 5)"
            :key="img.id"
            class="w-[72px] h-[72px] sm:w-20 sm:h-20 rounded-lg overflow-hidden border hover:border-primary transition-colors cursor-pointer"
            @click="openLightbox(idx)"
          >
            <img
              :src="getThumbUrl(img.image_url) || ''"
              :alt="`Фото ${idx + 1}`"
              class="w-full h-full object-cover"
              loading="lazy"
            >
          </button>
        </div>

        <!-- Удалить (свой отзыв) -->
        <button
          v-if="canDelete"
          class="mt-2 text-xs text-muted-foreground hover:text-destructive transition-colors"
          @click="emit('delete', review.id)"
        >
          Удалить отзыв
        </button>
      </div>
    </div>

    <!-- Lightbox -->
    <Dialog v-model:open="lightboxOpen">
      <DialogContent class="max-w-3xl p-0 bg-black/95 border-none">
        <DialogTitle class="sr-only">
          Фото отзыва
        </DialogTitle>
        <div class="relative flex items-center justify-center min-h-[300px] sm:min-h-[500px]">
          <img
            v-if="review.review_images?.[lightboxIndex]"
            :src="getFullUrl(review.review_images[lightboxIndex].image_url) || ''"
            :alt="`Фото ${lightboxIndex + 1}`"
            class="max-h-[80vh] max-w-full object-contain"
          >

          <!-- Навигация -->
          <button
            v-if="lightboxIndex > 0"
            class="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
            @click="navigateLightbox(-1, review.review_images)"
          >
            <Icon name="lucide:chevron-left" class="w-6 h-6 text-white" />
          </button>
          <button
            v-if="review.review_images && lightboxIndex < review.review_images.length - 1"
            class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
            @click="navigateLightbox(1, review.review_images)"
          >
            <Icon name="lucide:chevron-right" class="w-6 h-6 text-white" />
          </button>

          <!-- Счётчик -->
          <div
            v-if="review.review_images && review.review_images.length > 1"
            class="absolute bottom-3 left-1/2 -translate-x-1/2 text-white/80 text-sm bg-black/50 px-3 py-1 rounded-full"
          >
            {{ lightboxIndex + 1 }} / {{ review.review_images.length }}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
