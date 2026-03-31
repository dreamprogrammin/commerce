<script setup lang="ts">
import { useQuery } from "@tanstack/vue-query";
import { useCategoryQuestionsStore } from "@/stores/publicStore/categoryQuestionsStore";

const props = defineProps<{
  categoryId: string;
  categoryName?: string;
}>();

const questionsStore = useCategoryQuestionsStore();

const { data: questions, isLoading } = useQuery({
  queryKey: ["category-questions", () => props.categoryId],
  queryFn: () => questionsStore.fetchQuestions(props.categoryId),
  staleTime: 5 * 60 * 1000,
  gcTime: 10 * 60 * 1000,
});

const displayedQuestions = computed(() => {
  if (!questions.value) return [];
  return questions.value;
});

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function sanitizeAndRenderHTML(html: string | null): string {
  if (!html) return "";
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = html;
  const scripts = tempDiv.querySelectorAll("script, style");
  scripts.forEach((s) => s.remove());
  return tempDiv.innerHTML;
}
</script>

<template>
  <div
    v-if="displayedQuestions.length"
    class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8"
  >
    <div class="mb-6">
      <h2 class="text-2xl font-bold mb-2">Часто задаваемые вопросы</h2>
      <p class="text-muted-foreground text-sm">
        Ответы на популярные вопросы о категории {{ categoryName || "игрушек" }}
      </p>
    </div>

    <div v-if="isLoading" class="space-y-4">
      <div v-for="i in 3" :key="i" class="animate-pulse border rounded-lg p-4">
        <div class="h-5 bg-muted rounded w-3/4 mb-3" />
        <div class="h-4 bg-muted rounded w-full mb-2" />
        <div class="h-4 bg-muted rounded w-5/6" />
      </div>
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="(q, index) in displayedQuestions"
        :key="q.id"
        class="border rounded-lg p-5 hover:shadow-md transition-shadow"
      >
        <div class="flex items-start gap-3 mb-3">
          <div
            class="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"
          >
            <span class="text-sm font-bold text-primary">{{ index + 1 }}</span>
          </div>
          <div class="flex-1">
            <h3 class="text-base font-semibold leading-relaxed text-foreground">
              {{ q.question_text }}
            </h3>
          </div>
        </div>

        <div v-if="q.answer_text" class="pl-11">
          <div
            class="faq-answer text-sm leading-relaxed text-muted-foreground"
            v-html="sanitizeAndRenderHTML(q.answer_text)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* FIX Tailwind v4: @reference нужен чтобы @apply видел утилиты из основного CSS */
@reference "~/assets/css/tailwind.css";

.faq-answer :deep(strong) {
  @apply font-semibold text-foreground;
}

.faq-answer :deep(ul) {
  @apply list-disc list-inside my-2 space-y-1;
}

.faq-answer :deep(li) {
  @apply text-muted-foreground;
}

.faq-answer :deep(a) {
  @apply text-primary hover:underline font-medium;
}

.faq-answer :deep(p) {
  @apply mb-2;
}
</style>