<script setup lang="ts">
import { Icon } from '#components'
import { formatAverageRating, summarizeRatingDistribution } from '@/utils/ratingDistribution'

interface CategoryReview {
  review_id: string
  rating: number
  text: string
  created_at: string
  user_name: string
  product_name: string
  product_slug: string
}

/*
 * totalReviews и averageRating сюда больше не передают. Раньше они приходили
 * из categoryStats родителя — суммы review_count по товарам ТЕКУЩЕЙ страницы
 * выдачи. Из-за этого блок то показывался, то исчезал при смене страницы или
 * фильтра, а проценты в распределении считались от страничного числа при
 * категорийном числителе. Теперь и итог, и средняя выводятся из того же
 * распределения, что рисует шкалу, — источник один.
 */
interface Props {
  categoryId: string
  categoryName: string
}

const props = defineProps<Props>()

const supabase = useSupabaseClient()

/*
 * Загрузка идёт через `useAsyncData`, а не в `onMounted`, и обработчик
 * ВОЗВРАЩАЕТ данные, а не раскладывает их по `ref`.
 *
 * Зачем на сервере. С `onMounted` блок появлялся только на клиенте, через
 * несколько секунд после первой отрисовки, и это стоило дважды: тексты
 * отзывов не попадали в серверную разметку вовсе (для поисковика их не
 * существовало), а поздняя вставка выталкивала вниз уже нарисованное — на
 * бренд-лендинге высота страницы прыгала 3178 → 4928, CLS доходил до 0.4672
 * при пороге 0.1.
 *
 * Почему именно `return`, а не присваивание в `ref`. Обычный `ref` в payload
 * не попадает: сервер бы его наполнил, а клиент при гидратации получил
 * пустоту и блок мигнул бы — ровно та ошибка, на которой я попался с
 * `availableBrands` в `pages/catalog/[...slug].vue`. Возвращённое значение
 * `useAsyncData` сериализует сам, и повторного запроса на клиенте нет.
 *
 * Обращений к DOM в компоненте нет — проверено перед переносом, иначе
 * серверный рендер бы упал.
 */
const { data, pending } = await useAsyncData(
  () => `category-reviews-${props.categoryId}`,
  async () => {
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

    return {
      reviews: (reviewsResult.data || []) as CategoryReview[],
      distribution: (distributionResult.data || []) as { stars: number, count: number }[],
    }
  },
  {
    watch: [() => props.categoryId],
    // Пустой блок лучше падения страницы: категория без отзывов — норма.
    default: () => ({ reviews: [] as CategoryReview[], distribution: [] as { stars: number, count: number }[] }),
  },
)

const reviews = computed<CategoryReview[]>(() => data.value?.reviews ?? [])
const ratingDistributionData = computed(() => data.value?.distribution ?? [])
const isLoading = computed(() => pending.value)

// Форматирование даты
function formatDate(dateString: string) {
  const date = new Date(dateString)
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

// Сводка по всей категории: и шкала, и итог, и средняя — из одного массива
const summary = computed(() => summarizeRatingDistribution(ratingDistributionData.value))
const ratingDistribution = computed(() => summary.value.buckets)
const totalReviews = computed(() => summary.value.total)
const averageRating = computed(() => formatAverageRating(summary.value.average))

/*
 * Пусто ли — решает сам компонент, а не родитель: только здесь есть
 * категорийные данные. Пока грузим, ничего не показываем, чтобы блок
 * не мигал на страницах без отзывов.
 */
const hasReviews = computed(() => !isLoading.value && totalReviews.value > 0)
</script>

<template>
  <!-- v-if внутри компонента, а не у родителя: категорийные данные есть
       только здесь, родитель знал лишь про текущую страницу выдачи -->
  <section v-if="hasReviews" class="bg-white dark:bg-card rounded-xl p-6 lg:p-8 border shadow-sm">
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
              name="gravity-ui:star-fill"
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
            <div class="flex items-center gap-1 w-8">
              <span class="text-sm">{{ item.stars }}</span>
              <Icon
                name="gravity-ui:star-fill"
                class="w-3 h-3 text-yellow-400"
              />
            </div>
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
                  name="gravity-ui:star-fill"
                  class="w-4 h-4"
                  :class="
                    i <= review.rating ? 'text-yellow-400' : 'text-gray-300'
                  "
                />
              </div>
            </div>

            <!-- Текст отзыва -->
            <p
              v-if="review.text && review.text.trim()"
              class="text-sm text-foreground mb-3 line-clamp-3"
            >
              {{ review.text }}
            </p>
            <p v-else class="text-sm text-muted-foreground italic mb-3">
              Отзыв без комментария
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
