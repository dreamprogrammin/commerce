<script setup lang="ts">
import { Star, StarHalf } from 'lucide-vue-next'

const props = defineProps<{
  avgRating: number
  totalReviews: number
}>()

// Склонение слова "отзыв"
function pluralizeReviews(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 19)
    return 'отзывов'
  if (mod10 === 1)
    return 'отзыв'
  if (mod10 >= 2 && mod10 <= 4)
    return 'отзыва'
  return 'отзывов'
}

// Формат: "120+" для больших чисел
const formattedCount = computed(() => {
  if (props.totalReviews >= 100) {
    const rounded = Math.floor(props.totalReviews / 10) * 10
    return `${rounded}+`
  }
  return String(props.totalReviews)
})

// Генерация состояний звёзд
const stars = computed(() => {
  return Array.from({ length: 5 }, (_, i) => {
    const pos = i + 1
    if (pos <= Math.floor(props.avgRating))
      return 'full'
    if (pos - 0.5 <= props.avgRating)
      return 'half'
    return 'empty'
  })
})
</script>

<template>
  <div class="flex items-center gap-2.5 py-2">
    <!-- Звёзды -->
    <div class="inline-flex items-center gap-0.5">
      <component
        :is="state === 'half' ? StarHalf : Star"
        v-for="(state, i) in stars"
        :key="i"
        class="w-5 h-5 lg:w-6 lg:h-6"
        :class="state !== 'empty' ? 'fill-yellow-400 text-yellow-400' : 'fill-gray-200 text-gray-300'"
        :stroke-width="1.5"
      />
    </div>

    <!-- Текст -->
    <span class="text-sm lg:text-base text-muted-foreground">
      <span class="font-semibold text-foreground">{{ avgRating.toFixed(1) }}</span>
      на основе {{ formattedCount }} {{ pluralizeReviews(totalReviews) }}
    </span>
  </div>
</template>
