<script setup lang="ts">
import { Icon } from '#components'

interface CategoryReview {
  review_id: number
  rating: number
  text: string
  created_at: string
  user_name: string
  product_name: string
  product_slug: string
}

interface Props {
  categoryId: string
  categoryName: string
  totalReviews: number
  averageRating: string
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()
const reviews = ref<CategoryReview[]>([])
const ratingDistributionData = ref<{ stars: number, count: number }[]>([])
const isLoading = ref(true)

// Загрузка отзывов и распределения оценок
async function loadReviews() {
  isLoading.value = true
  try {
    const [reviewsResult, distributionResult] = await Promise.all([
      supabase.rpc('get_latest_category_reviews', {
        p_category_id: props.categoryId,
        p_limit: 5,
      }),
      supabase.rpc('get_category_rating_distribution', {
        p_category_id: props.categoryId,
      }),
    ])

    if (reviewsResult.error)
      throw reviewsResult.error
    if (distributionResult.error)
      throw distributionResult.error

    reviews.value = reviewsResult.data || []
    ratingDistributionData.value = distributionResult.data || []
  }
  catch (error) {
    console.error('Error loading category reviews:', error)
    reviews.value = []
    ratingDistributionData.value = []
  }
  finally {
    isLoading.value = false
  }
}

// Форматирование даты
function formatDate(dateString: string) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

// Загрузка при монтировании
onMounted(() => {
  loadReviews()
})

// Перезагрузка при изменении категории
watch(
  () => props.categoryId,
  () => {
    loadReviews()
  },
)

// Распределение оценок (реальные данные из базы)
const ratingDistribution = computed(() => {
  const total = props.totalReviews
  if (total === 0)
    return []

  // Создаем массив для всех оценок от 5 до 1
  const distribution = [5, 4, 3, 2, 1].map((stars) => {
    const item = ratingDistributionData.value.find(d => d.stars === stars)
    const count = item?.count || 0
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0
    return { stars, count, percentage }
  })

  return distribution
})
</script>

<template>
  <section class="bg-white dark:bg-card rounded-xl p-6 lg:p-8 border shadow-sm">
    <h2 class="text-2xl font-bold mb-6">
      Отзывы о товарах в категории "{{ categoryName }}"
    </h2>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Левая колонка: Сводка -->
      <div class="lg:col-span-1 space-y-6">
        <div class="text-center lg:text-left">
          <div class="text-5xl font-bold mb-2">
            {{ averageRating }}
          </div>
          <div
            class="flex items-center justify-center lg:justify-start gap-1 mb-2"
          >
            <Icon
              v-for="i in 5"
              :key="i"
              name="streamline-stickies-color:star"
              class="w-6 h-6"
              :class="
                i <= Math.round(Number(averageRating.replace(',', '.')))
                  ? 'text-yellow-400'
                  : 'text-gray-300'
              "
            />
          </div>
          <p class="text-sm text-muted-foreground">
            На основе {{ totalReviews }}
            {{ totalReviews === 1 ? "отзыва" : "отзывов" }}
          </p>
        </div>

        <!-- Распределение оценок -->
        <div class="space-y-2">
          <div
            v-for="item in ratingDistribution"
            :key="item.stars"
            class="flex items-center gap-2"
          >
            <span class="text-sm w-8">{{ item.stars }} ★</span>
            <div
              class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden"
            >
              <div
                class="h-full bg-yellow-400 transition-all"
                :style="{ width: `${item.percentage}%` }"
              />
            </div>
            <span class="text-sm text-muted-foreground w-12 text-right">{{ item.percentage }}%</span>
          </div>
        </div>
      </div>

      <!-- Правая колонка: Список отзывов -->
      <div class="lg:col-span-2 space-y-4">
        <div v-if="isLoading" class="space-y-4">
          <Skeleton v-for="i in 3" :key="i" class="h-32 w-full" />
        </div>

        <div
          v-else-if="reviews.length === 0"
          class="text-center py-8 text-muted-foreground"
        >
          Пока нет отзывов для этой категории
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="review in reviews"
            :key="review.review_id"
            class="border rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <!-- Заголовок отзыва -->
            <div class="flex items-start justify-between mb-2">
              <NuxtLink
                :to="`/catalog/products/${review.product_slug}`"
                class="font-semibold text-primary hover:underline"
              >
                {{ review.product_name }}
              </NuxtLink>
              <div class="flex items-center gap-1">
                <Icon
                  v-for="i in 5"
                  :key="i"
                  name="streamline-stickies-color:star"
                  class="w-4 h-4"
                  :class="
                    i <= review.rating ? 'text-yellow-400' : 'text-gray-300'
                  "
                />
              </div>
            </div>

            <!-- Текст отзыва -->
            <p class="text-sm text-foreground mb-3 line-clamp-3">
              {{ review.text }}
            </p>

            <!-- Автор и дата -->
            <div class="flex items-center gap-2 text-xs text-muted-foreground">
              <span class="font-medium">{{ review.user_name }}</span>
              <span>•</span>
              <span>{{ formatDate(review.created_at) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
