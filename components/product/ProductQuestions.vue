<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { useAuthStore } from '@/stores/auth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useProductQuestionsStore } from '@/stores/publicStore/productQuestionsStore'

const props = defineProps<{
  productId: string
}>()

const questionsStore = useProductQuestionsStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const queryClient = useQueryClient()

const questionText = ref('')
const isSubmitting = ref(false)

const { data: questions, isLoading } = useQuery({
  queryKey: ['product-questions', () => props.productId],
  queryFn: () => questionsStore.fetchQuestions(props.productId),
  staleTime: 2 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: true,
})

async function submitQuestion() {
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal()
    return
  }

  const text = questionText.value.trim()
  if (!text)
    return

  isSubmitting.value = true
  const result = await questionsStore.askQuestion(props.productId, text)
  isSubmitting.value = false

  if (result) {
    questionText.value = ''
    queryClient.invalidateQueries({ queryKey: ['product-questions', props.productId] })
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const highlightedQuestionId = ref<string | null>(null)
const route = useRoute()

// Автоскролл к вопросу из уведомления
function scrollToQuestion() {
  const hash = window.location.hash || route.hash
  if (!hash || !hash.startsWith('#question-')) return

  const questionId = hash.replace('#question-', '')
  console.log('[ProductQuestions] Scrolling to question:', questionId)

  // Даём время на рендер списка вопросов
  const attempts = [300, 600, 1000, 1500] // Попробуем несколько раз с задержкой
  let attemptIndex = 0

  function tryScroll() {
    const element = document.querySelector(hash)
    console.log('[ProductQuestions] Attempt', attemptIndex + 1, 'Element found:', !!element)

    if (element) {
      // Прокручиваем к элементу
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })

      // Подсвечиваем
      highlightedQuestionId.value = questionId
      setTimeout(() => {
        highlightedQuestionId.value = null
      }, 3000)
    }
    else if (attemptIndex < attempts.length - 1) {
      // Пробуем ещё раз через заданное время
      attemptIndex++
      setTimeout(tryScroll, attempts[attemptIndex] - attempts[attemptIndex - 1])
    }
    else {
      console.warn('[ProductQuestions] Failed to find element after all attempts')
    }
  }

  setTimeout(tryScroll, attempts[0])
}

onMounted(() => {
  scrollToQuestion()
})

// Следим за изменением route (для случая когда переходим с другой страницы)
watch(() => route.hash, (newHash) => {
  if (newHash && newHash.startsWith('#question-')) {
    scrollToQuestion()
  }
})

// Следим за загрузкой вопросов (скроллим после загрузки)
watch(() => questions.value, (newQuestions) => {
  if (newQuestions && newQuestions.length > 0) {
    const hash = window.location.hash || route.hash
    if (hash && hash.startsWith('#question-')) {
      // Даём время на рендер
      nextTick(() => {
        scrollToQuestion()
      })
    }
  }
})
</script>

<template>
  <div class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8">
    <h2 class="text-xl font-bold mb-4">
      Вопросы и ответы
    </h2>

    <!-- Форма вопроса -->
    <div class="mb-6">
      <div v-if="authStore.isLoggedIn" class="flex gap-3">
        <Textarea
          v-model="questionText"
          placeholder="Задайте вопрос о товаре..."
          class="flex-1 min-h-[80px]"
          :disabled="isSubmitting"
        />
        <Button
          :disabled="!questionText.trim() || isSubmitting"
          class="self-end"
          @click="submitQuestion"
        >
          {{ isSubmitting ? 'Отправка...' : 'Отправить' }}
        </Button>
      </div>
      <div v-else>
        <Button variant="outline" @click="modalStore.openLoginModal()">
          <Icon name="lucide:log-in" class="w-4 h-4 mr-2" />
          Войдите, чтобы задать вопрос
        </Button>
      </div>
    </div>

    <!-- Список вопросов -->
    <div v-if="isLoading" class="space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse">
        <div class="h-4 bg-muted rounded w-3/4 mb-2" />
        <div class="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>

    <div v-else-if="questions?.length" class="space-y-4">
      <div
        v-for="q in questions"
        :id="`question-${q.id}`"
        :key="q.id"
        class="border rounded-lg p-4 transition-all duration-500 scroll-mt-4"
        :class="{
          'border-blue-500 bg-blue-50 dark:bg-blue-950/20 shadow-lg': highlightedQuestionId === q.id,
        }"
      >
        <!-- Вопрос -->
        <div class="flex items-start gap-3">
          <div
            class="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
            :class="q.is_auto_generated ? 'bg-blue-100 dark:bg-blue-950' : 'bg-primary/10'"
          >
            <Icon
              :name="q.is_auto_generated ? 'lucide:sparkles' : 'lucide:help-circle'"
              class="w-4 h-4"
              :class="q.is_auto_generated ? 'text-blue-600 dark:text-blue-400' : 'text-primary'"
            />
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium">
              {{ q.question_text }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              <span v-if="q.is_auto_generated" class="inline-flex items-center gap-1">
                <Icon name="lucide:info" class="w-3 h-3" />
                Часто задаваемый вопрос
              </span>
              <span v-else>
                {{ [q.profiles?.first_name, q.profiles?.last_name].filter(Boolean).join(' ') || 'Пользователь' }} · {{ formatDate(q.created_at) }}
              </span>
            </p>
          </div>
          <!-- Удалить свой вопрос (только для пользовательских) -->
          <button
            v-if="!q.is_auto_generated && authStore.user?.id === q.user_id"
            class="text-muted-foreground hover:text-destructive transition-colors"
            title="Удалить вопрос"
            @click="async () => {
              const ok = await questionsStore.deleteQuestion(q.id)
              if (ok) queryClient.invalidateQueries({ queryKey: ['product-questions', productId] })
            }"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>

        <!-- Ответ -->
        <div v-if="q.answer_text" class="ml-11 mt-3 pl-4 border-l-2 border-primary/20">
          <p class="text-sm">
            {{ q.answer_text }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            Ответ магазина · {{ q.answered_at ? formatDate(q.answered_at) : '' }}
          </p>
        </div>

        <!-- Ожидание ответа -->
        <div v-else class="ml-11 mt-2">
          <span class="text-xs text-muted-foreground italic">Ожидает ответа</span>
        </div>
      </div>
    </div>

    <p v-else class="text-sm text-muted-foreground">
      Вопросов пока нет. Будьте первым!
    </p>
  </div>
</template>
