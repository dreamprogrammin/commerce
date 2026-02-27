<script setup lang="ts">
import type { ProductReview } from '@/stores/publicStore/reviewsStore'
import StarRating from './StarRating.vue';

defineProps<{
  review: ProductReview
  canDelete?: boolean
}>()

const emit = defineEmits<{
  delete: [id: string]
}>()

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
  </div>
</template>
