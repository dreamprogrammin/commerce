<script setup lang="ts">
/**
 * Частые вопросы о бренде. Порт секции FAQ из `Бренд.dc.html`.
 *
 * Данные уже были в базе — таблица `brand_questions`, 50 записей, наполняется
 * через `generate_brand_questions`. На странице бренда они не показывались
 * нигде: блока просто не существовало.
 *
 * Берём только отвеченные (`answer_text` не пуст): вопрос без ответа в
 * публичном FAQ бесполезен, а разметку FAQPage без ответа Google считает
 * невалидной.
 *
 * Разметки FAQPage здесь намеренно НЕТ. Google отключил для неё сниппеты
 * 7 мая 2026 — выигрыша она не даёт, а дублирующиеся узлы на странице,
 * где уже есть Product и BreadcrumbList, только усложняют отладку. Решение
 * записано в SEO-аудите, раздел «Не является багом».
 */
interface BrandQuestion {
  id: string
  question_text: string
  answer_text: string | null
}

const props = defineProps<{
  questions?: BrandQuestion[] | null
  brandName: string
}>()

const rows = computed(() =>
  (props.questions ?? []).filter(q => q.answer_text?.trim()),
)

/*
 * Открыт один вопрос за раз, как в макете. Индекс, а не Set: аккордеон
 * с несколькими открытыми панелями толкает вниз всё, что под ним, — на
 * бренд-странице это блок «Другие бренды», и он бы прыгал.
 */
const openIndex = ref(-1)

function toggle(index: number) {
  openIndex.value = openIndex.value === index ? -1 : index
}
</script>

<template>
  <section v-if="rows.length" class="bfq">
    <h2 class="bfq__title">
      Частые вопросы о {{ brandName }}
    </h2>

    <div class="bfq__list">
      <div v-for="(row, index) in rows" :key="row.id" class="bfq__item">
        <button
          type="button"
          class="bfq__head"
          :aria-expanded="openIndex === index"
          :aria-controls="`bfq-panel-${row.id}`"
          @click="toggle(index)"
        >
          <span class="bfq__question">{{ row.question_text }}</span>
          <Icon
            :name="openIndex === index ? 'lucide:minus' : 'lucide:plus'"
            class="bfq__icon"
          />
        </button>
        <p
          v-if="openIndex === index"
          :id="`bfq-panel-${row.id}`"
          class="bfq__answer"
        >
          {{ row.answer_text }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bfq__title {
    margin: 0 0 14px;
    color: var(--foreground);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.025em;
  }

  .bfq__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bfq__item {
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: #fff;
    box-shadow: 0 6px 18px rgb(15 23 42 / 0.05);
  }

  .bfq__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    width: 100%;
    padding: 18px 20px;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .bfq__question {
    color: var(--foreground);
    font-weight: 600;
    font-size: 15.5px;
    text-wrap: pretty;
  }

  .bfq__icon {
    flex: none;
    width: 20px;
    height: 20px;
    color: var(--primary);
  }

  .bfq__answer {
    margin: 0;
    padding: 0 20px 20px;
    color: var(--muted-foreground);
    font-size: 14.5px;
    line-height: 1.68;
    text-wrap: pretty;
  }

  @media (min-width: 900px) {
    .bfq__title {
      font-size: 30px;
    }
  }
}
</style>
