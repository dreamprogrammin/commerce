<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { useCategoryQuestionsStore } from '@/stores/publicStore/categoryQuestionsStore'

const props = defineProps<{
  categoryId: string
  categoryName?: string
}>()

const questionsStore = useCategoryQuestionsStore()

const { data: questions, isLoading } = useQuery({
  queryKey: ['category-questions', () => props.categoryId],
  queryFn: () => questionsStore.fetchQuestions(props.categoryId),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
})

// Показать все вопросы
const displayedQuestions = computed(() => {
  if (!questions.value) return []
  return questions.value
})

// Форматирование даты
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
</script>

<template>
  <div v-if="displayedQuestions.length" class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8">
    <!-- Заголовок -->
    <div class="mb-6">
      <h2 class="text-2xl font-bold mb-2">
        Часто задаваемые вопросы
      </h2>
      <p class="text-muted-foreground text-sm">
        Ответы на популярные вопросы о категории {{ categoryName || 'игрушек' }}
      </p>
    </div>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse border rounded-lg p-4">
        <div class="h-5 bg-muted rounded w-3/4 mb-3" />
        <div class="h-4 bg-muted rounded w-full mb-2" />
        <div class="h-4 bg-muted rounded w-5/6" />
      </div>
    </div>

    <!-- Список вопросов и ответов -->
    <div v-else class="space-y-4">
      <div
        v-for="(q, index) in displayedQuestions"
        :key="q.id"
        class="border rounded-lg p-5 hover:shadow-md transition-shadow"
      >
        <!-- Вопрос -->
        <div class="flex items-start gap-3 mb-3">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span class="text-sm font-bold text-primary">{{ index + 1 }}</span>
          </div>
          <div class="flex-1">
            <h3 class="text-base font-semibold leading-relaxed text-foreground">
              {{ q.question_text }}
            </h3>
          </div>
        </div>

        <!-- Ответ -->
        <div v-if="q.answer_text" class="pl-11">
          <p class="text-sm leading-relaxed text-muted-foreground">
            {{ q.answer_text }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
