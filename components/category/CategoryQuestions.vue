<script setup lang="ts">
import { useCategoryQuestionsStore } from '@/stores/publicStore/categoryQuestionsStore'

const props = defineProps<{
  categoryId: string
  categoryName?: string
}>()

const questionsStore = useCategoryQuestionsStore()

/*
 * `useAsyncData`, а не `useQuery`.
 *
 * `useQuery` из TanStack на сервере не выполняется, поэтому вопросы и
 * ответы не попадали в серверную разметку: для поисковика их не
 * существовало, хотя FAQ — ровно тот контент, который он показывает
 * расширенными сниппетами.
 *
 * `useAsyncData` отрабатывает на сервере и переносит результат в payload,
 * так что повторного запроса на клиенте нет. Ключ включает id категории,
 * `watch` перезапрашивает при переходе в другую категорию — прежний
 * `queryKey` делал то же самое.
 */
const { data: questions, pending: isLoading } = await useAsyncData(
  () => `category-questions-${props.categoryId}`,
  () => questionsStore.fetchQuestions(props.categoryId),
  {
    watch: [() => props.categoryId],
    default: () => [],
  },
)

const displayedQuestions = computed(() => {
  if (!questions.value)
    return []
  return questions.value
})

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/*
 * Санитайзер на регулярках, а не на DOM.
 *
 * Раньше здесь был `document.createElement` — на сервере DOM нет, и с ним
 * серверный рендер этого блока был невозможен в принципе.
 *
 * Правило осталось прежним: вырезаем `<script>` и `<style>`, остальное
 * пропускаем. Это НЕ полноценный санитайзер и никогда им не был —
 * DOM-версия тоже не трогала атрибуты вроде `onclick`. Текст ответов пишет
 * администратор через свою панель, источник доверенный.
 *
 * Важно, что версия одна на обе стороны: если бы сервер отдавал сырой
 * HTML, а клиент чистил его иначе, разметка бы разошлась и Vue сообщил бы
 * о рассинхроне гидратации. Именно поэтому здесь не используется
 * `useSafeHtml` — он на сервере намеренно возвращает строку как есть, а на
 * клиенте прогоняет через DOMPurify, то есть даёт РАЗНЫЙ результат.
 */
/*
 * Символы, которых нет в подмножествах шрифта, — в свой span с системным
 * стеком. Это не косметика, это килобайты.
 *
 * Тексты ответов пишет функция `generate_category_questions` в базе, и во
 * всех 191 записи есть стрелка `→` (U+2192), а в 42 ещё и `🔥` (U+1F525).
 * Ни того, ни другого нет ни в `latin`, ни в `cyrillic`, ни в `latin-ext`.
 * Браузер обязан взять грань, которая символ покрывает, а покрывают только
 * несокращённые легаси-`.woff` от @nuxt/fonts — и тянет их целиком.
 * Замер 25 августа 2026: категорийная страница везла 199 КБ шрифтов против
 * 93 КБ у `/catalog/all`, разница ровно в этих 105 КБ.
 *
 * Вид при этом НЕ меняется: глифов этих символов в Nunito нет вовсе
 * (проверено — Google по `text=→` и `text=🔥` отдаёт пустой woff2 на 31
 * байт), они и сегодня рисуются системным шрифтом. Просто теперь браузер
 * узнаёт об этом сразу, а не после 52 КБ загрузки.
 *
 * Правка временная, до исправления генератора в базе: он продолжит писать
 * стрелки. См. docs/HANDOFF.md.
 */
// Символ плюс необязательный селектор варианта U+FE0F (он делает эмодзи
// цветным и в класс символов не входит — иначе линтер справедливо ругается).
const OUTSIDE_FONT_SUBSETS
  = /(?:[\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\u{1F000}-\u{1FAFF}]\uFE0F?)+/gu

function wrapOutsideGlyphs(text: string): string {
  return text.replace(
    OUTSIDE_FONT_SUBSETS,
    match => `<span class="glyph-fallback">${match}</span>`,
  )
}

function sanitizeAndRenderHTML(html: string | null): string {
  if (!html)
    return ''
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    // Оборачиваем только ТЕКСТ, не трогая теги и их атрибуты.
    .split(/(<[^>]*>)/)
    .map(part => (part.startsWith('<') ? part : wrapOutsideGlyphs(part)))
    .join('')
}
</script>

<template>
  <div
    v-if="displayedQuestions.length"
    class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8"
  >
    <div class="mb-6">
      <h2 class="text-2xl font-bold mb-2">
        Часто задаваемые вопросы
      </h2>
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
  /* Символы вне подмножеств шрифта — системным стеком, минуя Nunito.
     Почему — см. комментарий к wrapOutsideGlyphs выше. */
  .faq-answer :deep(.glyph-fallback) {
    font-family: 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol', 'Noto Color Emoji', system-ui, sans-serif;
  }

  .faq-answer :deep(strong) {
    font-weight: 600;
    color: hsl(var(--foreground));
  }

  .faq-answer :deep(ul) {
    list-style-type: disc;
    list-style-position: inside;
    margin-top: 0.5rem;
    margin-bottom: 0.5rem;
  }

  .faq-answer :deep(ul) > * + * {
    margin-top: 0.25rem;
  }

  .faq-answer :deep(li) {
    color: hsl(var(--muted-foreground));
  }

  .faq-answer :deep(a) {
    color: hsl(var(--primary));
    font-weight: 500;
  }

  .faq-answer :deep(a:hover) {
    text-decoration: underline;
  }

  .faq-answer :deep(p) {
    margin-bottom: 0.5rem;
  }
}
</style>
