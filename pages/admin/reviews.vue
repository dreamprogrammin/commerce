<script setup lang="ts">
import StarRating from '@/components/product/StarRating.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_PRESETS } from '@/config/images'
import { BUCKET_NAME_REVIEWS } from '@/constants'
import { useAdminReviewsStore } from '@/stores/adminStore/adminReviewsStore'

definePageMeta({
  layout: 'admin',
})

const store = useAdminReviewsStore()
const { getImageUrl } = useSupabaseStorage()
const filter = ref<'all' | 'unpublished'>('unpublished')

onMounted(() => {
  store.fetchAllReviews(filter.value)
})

watch(filter, (val) => {
  store.fetchAllReviews(val)
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getThumbUrl(imageUrl: string) {
  return getImageUrl(BUCKET_NAME_REVIEWS, imageUrl, IMAGE_PRESETS.REVIEW_THUMB)
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">
        Отзывы покупателей
      </h1>
      <div class="flex gap-2">
        <Button
          :variant="filter === 'unpublished' ? 'default' : 'outline'"
          size="sm"
          @click="filter = 'unpublished'"
        >
          На модерации
          <Badge v-if="store.unpublishedCount > 0" variant="destructive" class="ml-2">
            {{ store.unpublishedCount }}
          </Badge>
        </Button>
        <Button
          :variant="filter === 'all' ? 'default' : 'outline'"
          size="sm"
          @click="filter = 'all'"
        >
          Все
        </Button>
      </div>
    </div>

    <div v-if="store.isLoading" class="space-y-4">
      <div v-for="i in 5" :key="i" class="animate-pulse border rounded-lg p-4">
        <div class="h-4 bg-muted rounded w-3/4 mb-2" />
        <div class="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>

    <div v-else-if="store.reviews.length === 0" class="text-center py-12 text-muted-foreground">
      <Icon name="lucide:star" class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>{{ filter === 'unpublished' ? 'Нет отзывов на модерации' : 'Отзывов пока нет' }}</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="r in store.reviews"
        :key="r.id"
        class="border rounded-lg p-4 bg-white"
        :class="{ 'border-yellow-200 bg-yellow-50/30': !r.is_published }"
      >
        <!-- Заголовок -->
        <div class="flex items-start justify-between gap-4 mb-3">
          <div class="flex-1">
            <NuxtLink
              v-if="r.products"
              :to="`/catalog/products/${r.products.slug}`"
              class="text-xs text-primary hover:underline font-medium"
              target="_blank"
            >
              {{ r.products.name }}
            </NuxtLink>

            <!-- Звёзды -->
            <div class="flex items-center gap-2 mt-1">
              <StarRating :model-value="r.rating" readonly size="sm" />
              <span class="text-sm font-medium">{{ r.rating }}/5</span>
            </div>

            <!-- Текст отзыва -->
            <p v-if="r.text" class="text-sm mt-2">
              {{ r.text }}
            </p>
            <p v-else class="text-sm text-muted-foreground mt-2 italic">
              Без текста (только оценка)
            </p>

            <!-- Фото отзыва -->
            <div v-if="r.review_images?.length" class="flex flex-wrap gap-1.5 mt-2">
              <div
                v-for="img in r.review_images"
                :key="img.id"
                class="w-14 h-14 rounded overflow-hidden border"
              >
                <img
                  :src="getThumbUrl(img.image_url) || ''"
                  alt="Фото"
                  class="w-full h-full object-cover"
                  loading="lazy"
                >
              </div>
            </div>

            <p class="text-xs text-muted-foreground mt-2">
              {{ [r.profiles?.first_name, r.profiles?.last_name].filter(Boolean).join(' ') || 'Пользователь' }} · {{ formatDate(r.created_at) }}
            </p>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <Button
              :variant="r.is_published ? 'outline' : 'default'"
              size="sm"
              @click="store.togglePublished(r.id)"
            >
              <Icon :name="r.is_published ? 'lucide:eye-off' : 'lucide:check'" class="w-4 h-4 mr-1" />
              {{ r.is_published ? 'Скрыть' : 'Одобрить' }}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-destructive hover:text-destructive"
              title="Удалить"
              @click="store.deleteReview(r.id)"
            >
              <Icon name="lucide:trash-2" class="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
