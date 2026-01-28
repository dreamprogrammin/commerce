<script setup lang="ts">
import { useAdminQuestionsStore } from '@/stores/adminStore/adminQuestionsStore'

definePageMeta({
  layout: 'Admin',
})

const store = useAdminQuestionsStore()
const filter = ref<'all' | 'unanswered'>('unanswered')
const answerTexts = ref<Record<string, string>>({})
const answeringId = ref<string | null>(null)

onMounted(() => {
  store.fetchAllQuestions(filter.value)
})

watch(filter, (val) => {
  store.fetchAllQuestions(val)
})

async function submitAnswer(questionId: string) {
  const text = answerTexts.value[questionId]?.trim()
  if (!text)
    return

  answeringId.value = questionId
  const ok = await store.answerQuestion(questionId, text)
  answeringId.value = null

  if (ok) {
    answerTexts.value[questionId] = ''
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-bold">
        Вопросы покупателей
      </h1>
      <div class="flex gap-2">
        <Button
          :variant="filter === 'unanswered' ? 'default' : 'outline'"
          size="sm"
          @click="filter = 'unanswered'"
        >
          Без ответа
          <Badge v-if="store.unansweredCount > 0" variant="destructive" class="ml-2">
            {{ store.unansweredCount }}
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

    <div v-else-if="store.questions.length === 0" class="text-center py-12 text-muted-foreground">
      <Icon name="lucide:message-circle" class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>{{ filter === 'unanswered' ? 'Нет вопросов без ответа' : 'Вопросов пока нет' }}</p>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="q in store.questions"
        :key="q.id"
        class="border rounded-lg p-4 bg-white"
        :class="{ 'border-orange-200 bg-orange-50/30': !q.answer_text }"
      >
        <!-- Заголовок -->
        <div class="flex items-start justify-between gap-4 mb-3">
          <div class="flex-1">
            <NuxtLink
              v-if="q.products"
              :to="`/catalog/products/${q.products.slug}`"
              class="text-xs text-primary hover:underline font-medium"
              target="_blank"
            >
              {{ q.products.name }}
            </NuxtLink>
            <p class="text-sm font-medium mt-1">
              {{ q.question_text }}
            </p>
            <p class="text-xs text-muted-foreground mt-1">
              {{ [q.profiles?.first_name, q.profiles?.last_name].filter(Boolean).join(' ') || 'Пользователь' }} · {{ formatDate(q.created_at) }}
            </p>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8"
              :title="q.is_published ? 'Скрыть' : 'Опубликовать'"
              @click="store.togglePublished(q.id)"
            >
              <Icon :name="q.is_published ? 'lucide:eye' : 'lucide:eye-off'" class="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="h-8 w-8 text-destructive hover:text-destructive"
              title="Удалить"
              @click="store.deleteQuestion(q.id)"
            >
              <Icon name="lucide:trash-2" class="w-4 h-4" />
            </Button>
          </div>
        </div>

        <!-- Существующий ответ -->
        <div v-if="q.answer_text" class="ml-4 pl-4 border-l-2 border-primary/20 bg-primary/5 rounded-r-lg p-3">
          <p class="text-sm">
            {{ q.answer_text }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            Ответ · {{ q.answered_at ? formatDate(q.answered_at) : '' }}
          </p>
        </div>

        <!-- Форма ответа -->
        <div v-else class="mt-3 flex gap-2">
          <Textarea
            v-model="answerTexts[q.id]"
            placeholder="Написать ответ..."
            class="flex-1 min-h-[60px]"
            :disabled="answeringId === q.id"
          />
          <Button
            :disabled="!answerTexts[q.id]?.trim() || answeringId === q.id"
            class="self-end"
            @click="submitAnswer(q.id)"
          >
            {{ answeringId === q.id ? '...' : 'Ответить' }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
