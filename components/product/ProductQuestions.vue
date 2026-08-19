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
  if (!questions.value)
    return []
  return questions.value.slice(0, 3)
})

// Аккордеон: первый вопрос раскрыт, остальные свёрнуты (как в макете).
const openQuestionId = ref<string | null>(null)

watch(displayedQuestions, (list) => {
  if (openQuestionId.value === null && list.length)
    openQuestionId.value = list[0].id
}, { immediate: true })

function toggleQuestion(id: string) {
  openQuestionId.value = openQuestionId.value === id ? null : id
}

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
  if (!text)
    return

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
  if (!hash || !hash.startsWith('#question-'))
    return

  const questionId = hash.replace('#question-', '')

  const attempts = [300, 600, 1000, 1500]
  let attemptIndex = 0

  function tryScroll() {
    const element = document.querySelector(hash)

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      highlightedQuestionId.value = questionId
      // Аккордеон: раскрываем, иначе ответ останется свёрнутым
      openQuestionId.value = questionId
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
  <div id="questions" class="pq-card scroll-mt-20">
    <!-- Заголовок с ссылкой "Все вопросы" -->
    <div class="flex items-center justify-between mb-3.5">
      <h2 class="pq-title">
        Частые вопросы
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

    <!-- Аккордеон вопросов и ответов -->
    <div v-else-if="displayedQuestions.length" class="flex flex-col gap-2 mb-4">
      <div
        v-for="q in displayedQuestions"
        :id="`question-${q.id}`"
        :key="q.id"
        class="pq-item"
        :class="{
          'pq-item--open': openQuestionId === q.id,
          'pq-item--highlight': highlightedQuestionId === q.id,
        }"
      >
        <button
          type="button"
          class="pq-head"
          :aria-expanded="openQuestionId === q.id"
          @click="toggleQuestion(q.id)"
        >
          <span class="flex-1 text-[14.5px] font-bold text-foreground">
            {{ q.question_text }}
          </span>
          <Icon
            :name="openQuestionId === q.id ? 'lucide:chevron-up' : 'lucide:chevron-down'"
            class="size-[18px] shrink-0 text-muted-foreground"
          />
        </button>

        <div v-if="openQuestionId === q.id" class="pq-body">
          <p class="text-xs text-muted-foreground mb-2">
            <span v-if="q.is_auto_generated">Часто задаваемый вопрос</span>
            <span v-else>
              {{ [q.profiles?.first_name, q.profiles?.last_name].filter(Boolean).join(' ') || 'Пользователь' }} · {{ formatDate(q.created_at) }}
            </span>
          </p>

          <template v-if="q.answer_text">
            <p class="text-sm leading-relaxed text-muted-foreground">
              {{ q.answer_text }}
            </p>
            <p class="text-xs text-muted-foreground/70 mt-2 flex items-center gap-1.5">
              <Icon name="lucide:store" class="size-3" />
              <span>Ответ магазина · {{ q.answered_at ? formatDate(q.answered_at) : formatDate(q.created_at) }}</span>
            </p>
          </template>

          <p v-else class="text-sm text-orange-600 italic flex items-center gap-1.5">
            <Icon name="lucide:clock" class="size-3.5" />
            <span>Магазин скоро ответит на ваш вопрос</span>
          </p>

          <!-- Кнопка удаления для владельца -->
          <button
            v-if="!q.is_auto_generated && authStore.user?.id === q.user_id"
            class="text-xs text-destructive hover:underline flex items-center gap-1 mt-2"
            @click="async () => {
              const ok = await questionsStore.deleteQuestion(q.id)
              if (ok) queryClient.invalidateQueries({ queryKey: ['product-questions', productId] })
            }"
          >
            <Icon name="lucide:trash-2" class="size-3" />
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
    <button type="button" class="pq-ask-btn" @click="openQuestionForm">
      Задать вопрос
    </button>

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
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .pq-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 18px 16px;
    box-shadow: var(--elevation-card);
  }

  @media (width >= 64rem) {
    .pq-card {
      padding: 24px 26px;
    }
  }

  .pq-title {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .pq-item {
    border-radius: 16px;
    background: var(--muted);
    border: 1px solid transparent;
    transition:
      background 0.15s ease,
      box-shadow 0.15s ease;
  }

  .pq-item--open {
    background: linear-gradient(
      165deg,
      color-mix(in oklch, var(--brand-surface) 55%, var(--card)),
      var(--brand-surface)
    );
    border-color: rgba(255, 255, 255, 0.75);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      0 4px 12px rgba(43, 127, 255, 0.1);
  }

  .pq-item--highlight {
    border-color: var(--primary);
  }

  .pq-head {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 14px 16px;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
  }

  .pq-body {
    padding: 0 16px 15px;
  }

  .pq-ask-btn {
    width: 100%;
    height: 44px;
    padding: 0 20px;
    border-radius: 13px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.98), rgba(224, 233, 247, 0.62));
    -webkit-backdrop-filter: blur(10px) saturate(1.6);
    backdrop-filter: blur(10px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 #fff,
      0 5px 14px rgba(43, 127, 255, 0.16);
    color: var(--primary);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: box-shadow 0.18s ease;
  }

  .pq-ask-btn:hover {
    box-shadow:
      inset 0 1px 0 #fff,
      0 8px 20px rgba(43, 127, 255, 0.26);
  }
}
</style>
