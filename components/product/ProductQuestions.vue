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

    <!-- Список вопросов с аккордеоном -->
    <div v-else-if="displayedQuestions.length" class="space-y-2 mb-4">
      <Collapsible
        v-for="q in displayedQuestions"
        :id="`question-${q.id}`"
        :key="q.id"
        :default-open="q.id === highlightedQuestionId"
        class="border rounded-lg transition-all duration-300"
        :class="{
          'border-primary bg-blue-50': highlightedQuestionId === q.id,
        }"
      >
        <CollapsibleTrigger class="w-full">
          <div class="flex items-start justify-between gap-3 p-4 hover:bg-muted/30 transition-colors">
            <div class="flex-1 text-left">
              <p class="text-sm font-medium leading-relaxed">
                {{ q.question_text }}
              </p>
              <div class="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                <Icon name="lucide:message-circle" class="w-3 h-3" />
                <span v-if="q.answer_text">{{ q.answer_text ? '1 ответ' : 'Ожидает ответа' }}</span>
                <span v-else>Ожидает ответа</span>
              </div>
            </div>
            <Icon name="lucide:chevron-down" class="w-5 h-5 text-muted-foreground transition-transform duration-200 collapsible-icon flex-shrink-0" />
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div class="px-4 pb-4 pt-2 border-t bg-muted/10">
            <!-- Ответ -->
            <div v-if="q.answer_text" class="pl-4 border-l-2 border-primary/40">
              <p class="text-sm text-muted-foreground leading-relaxed">
                {{ q.answer_text }}
              </p>
              <p class="text-xs text-muted-foreground/70 mt-2">
                Ответ магазина · {{ q.answered_at ? formatDate(q.answered_at) : formatDate(q.created_at) }}
              </p>
            </div>

            <!-- Ожидание ответа -->
            <div v-else class="text-sm text-muted-foreground italic">
              Магазин скоро ответит на ваш вопрос
            </div>

            <!-- Кнопка удаления для владельца -->
            <button
              v-if="!q.is_auto_generated && authStore.user?.id === q.user_id"
              class="mt-3 text-xs text-destructive hover:underline flex items-center gap-1"
              @click="async () => {
                const ok = await questionsStore.deleteQuestion(q.id)
                if (ok) queryClient.invalidateQueries({ queryKey: ['product-questions', productId] })
              }"
            >
              <Icon name="lucide:trash-2" class="w-3 h-3" />
              Удалить вопрос
            </button>
          </div>
        </CollapsibleContent>
      </Collapsible>
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

<style scoped>
/* Анимация для иконки chevron в аккордеоне */
[data-state="open"] .collapsible-icon {
  transform: rotate(180deg);
}
</style>
