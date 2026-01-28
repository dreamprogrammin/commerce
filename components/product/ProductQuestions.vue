<script setup lang="ts">
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
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
const isDialogOpen = ref(false)
const isDrawerOpen = ref(false)

const { data: questions, isLoading } = useQuery({
  queryKey: ['product-questions', () => props.productId],
  queryFn: () => questionsStore.fetchQuestions(props.productId),
  staleTime: 2 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
  refetchOnWindowFocus: true,
})

// Показать только первые 3 вопроса
const displayedQuestions = computed(() => {
  if (!questions.value) return []
  return questions.value.slice(0, 3)
})

// Открыть форму вопроса
function openQuestionForm() {
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal()
    return
  }

  // Определяем устройство
  const isMobile = window.innerWidth < 768
  if (isMobile) {
    isDrawerOpen.value = true
  }
  else {
    isDialogOpen.value = true
  }
}

async function submitQuestion() {
  const text = questionText.value.trim()
  if (!text) return

  isSubmitting.value = true
  const result = await questionsStore.askQuestion(props.productId, text)
  isSubmitting.value = false

  if (result) {
    questionText.value = ''
    isDialogOpen.value = false
    isDrawerOpen.value = false
    queryClient.invalidateQueries({ queryKey: ['product-questions', props.productId] })
    toast.success('Ваш вопрос отправлен!')
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

  const attempts = [300, 600, 1000, 1500]
  let attemptIndex = 0

  function tryScroll() {
    const element = document.querySelector(hash)

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightedQuestionId.value = questionId
      setTimeout(() => {
        highlightedQuestionId.value = null
      }, 3000)
    }
    else if (attemptIndex < attempts.length - 1) {
      attemptIndex++
      const currentDelay = attempts[attemptIndex]
      const previousDelay = attempts[attemptIndex - 1]
      if (currentDelay !== undefined && previousDelay !== undefined) {
        setTimeout(tryScroll, currentDelay - previousDelay)
      }
    }
  }

  const firstDelay = attempts[0]
  if (firstDelay !== undefined) {
    setTimeout(tryScroll, firstDelay)
  }
}

onMounted(() => {
  scrollToQuestion()
})

watch(() => route.hash, (newHash) => {
  if (newHash && newHash.startsWith('#question-')) {
    scrollToQuestion()
  }
})

watch(() => questions.value, (newQuestions) => {
  if (newQuestions && newQuestions.length > 0) {
    const hash = window.location.hash || route.hash
    if (hash && hash.startsWith('#question-')) {
      nextTick(() => {
        scrollToQuestion()
      })
    }
  }
})
</script>

<template>
  <div class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8">
    <!-- Заголовок с ссылкой "Все вопросы" -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-xl font-bold">
        Вопросы покупателей
      </h2>
      <button
        v-if="questions && questions.length > 3"
        class="text-sm text-primary hover:underline flex items-center gap-1"
        @click="$router.push('#all-questions')"
      >
        <span>Все вопросы ({{ questions.length }})</span>
        <Icon name="lucide:chevron-right" class="w-4 h-4" />
      </button>
    </div>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="animate-pulse border rounded-lg p-4">
        <div class="h-4 bg-muted rounded w-3/4 mb-2" />
        <div class="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>

    <!-- Список вопросов и ответов -->
    <div v-else-if="displayedQuestions.length" class="space-y-3 mb-4">
      <div
        v-for="q in displayedQuestions"
        :id="`question-${q.id}`"
        :key="q.id"
        class="border rounded-lg p-4 transition-all duration-300"
        :class="{
          'border-primary bg-blue-50 shadow-md': highlightedQuestionId === q.id,
        }"
      >
        <!-- Вопрос -->
        <div class="flex items-start gap-3 mb-3">
          <div class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Icon name="lucide:help-circle" class="w-4 h-4 text-primary" />
          </div>
          <div class="flex-1">
            <p class="text-sm font-medium leading-relaxed text-foreground">
              {{ q.question_text }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              <span v-if="q.is_auto_generated">
                Часто задаваемый вопрос
              </span>
              <span v-else>
                {{ [q.profiles?.first_name, q.profiles?.last_name].filter(Boolean).join(' ') || 'Пользователь' }} · {{ formatDate(q.created_at) }}
              </span>
            </p>
          </div>
        </div>

        <!-- Ответ -->
        <div v-if="q.answer_text" class="pl-11">
          <div class="bg-muted/30 rounded-lg p-3 border-l-2 border-primary/40">
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ q.answer_text }}
            </p>
            <p class="text-xs text-muted-foreground/70 mt-2 flex items-center gap-1.5">
              <Icon name="lucide:store" class="w-3 h-3" />
              <span>Ответ магазина · {{ q.answered_at ? formatDate(q.answered_at) : formatDate(q.created_at) }}</span>
            </p>
          </div>
        </div>

        <!-- Ожидание ответа -->
        <div v-else class="pl-11">
          <div class="bg-orange-50 rounded-lg p-3 border-l-2 border-orange-400">
            <p class="text-sm text-orange-600 italic flex items-center gap-1.5">
              <Icon name="lucide:clock" class="w-3.5 h-3.5" />
              <span>Магазин скоро ответит на ваш вопрос</span>
            </p>
          </div>
        </div>

        <!-- Кнопка удаления для владельца -->
        <div v-if="!q.is_auto_generated && authStore.user?.id === q.user_id" class="pl-11 mt-2">
          <button
            class="text-xs text-destructive hover:underline flex items-center gap-1"
            @click="async () => {
              const ok = await questionsStore.deleteQuestion(q.id)
              if (ok) queryClient.invalidateQueries({ queryKey: ['product-questions', productId] })
            }"
          >
            <Icon name="lucide:trash-2" class="w-3 h-3" />
            Удалить вопрос
          </button>
        </div>
      </div>
    </div>

    <!-- Если нет вопросов -->
    <div v-else class="text-center py-8">
      <Icon name="lucide:message-circle-question" class="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
      <p class="text-sm text-muted-foreground">
        Вопросов пока нет. Задайте первый!
      </p>
    </div>

    <!-- Кнопка "Задать вопрос" -->
    <Button
      size="lg"
      class="w-full"
      @click="openQuestionForm"
    >
      Задать вопрос
    </Button>

    <!-- Dialog для десктопа -->
    <Dialog v-model:open="isDialogOpen">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Задать вопрос о товаре</DialogTitle>
          <DialogDescription>
            Напишите ваш вопрос, и мы ответим в ближайшее время
          </DialogDescription>
        </DialogHeader>

        <div class="space-y-4 py-4">
          <Textarea
            v-model="questionText"
            placeholder="Введите ваш вопрос..."
            class="min-h-[120px]"
            :disabled="isSubmitting"
          />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            @click="isDialogOpen = false"
          >
            Отмена
          </Button>
          <Button
            :disabled="!questionText.trim() || isSubmitting"
            @click="submitQuestion"
          >
            {{ isSubmitting ? 'Отправка...' : 'Отправить' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Drawer для мобилки -->
    <Drawer v-model:open="isDrawerOpen">
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Задать вопрос о товаре</DrawerTitle>
          <DrawerDescription>
            Напишите ваш вопрос, и мы ответим в ближайшее время
          </DrawerDescription>
        </DrawerHeader>

        <div class="px-4 pb-4">
          <Textarea
            v-model="questionText"
            placeholder="Введите ваш вопрос..."
            class="min-h-[120px]"
            :disabled="isSubmitting"
          />
        </div>

        <DrawerFooter>
          <Button
            :disabled="!questionText.trim() || isSubmitting"
            @click="submitQuestion"
          >
            {{ isSubmitting ? 'Отправка...' : 'Отправить' }}
          </Button>
          <Button
            variant="outline"
            @click="isDrawerOpen = false"
          >
            Отмена
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
</template>
