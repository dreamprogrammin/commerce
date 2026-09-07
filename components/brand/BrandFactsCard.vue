<script setup lang="ts">
/**
 * Карточка «Коротко о бренде». Порт правой колонки секции ABOUT
 * из `Бренд.dc.html`.
 *
 * Данные — из `brands.facts` (jsonb, миграция 20260906120000). Формат
 * `[{ k, v }]`, порядок строк значим и задаётся автором.
 *
 * Компонент ничего не показывает, если фактов нет: пустая карточка с одним
 * заголовком выглядит как недоделка, а у большинства брендов поле пустое —
 * заполняется вручную и постепенно.
 */
import type { BrandFact } from '@/types'

const props = defineProps<{
  facts?: BrandFact[] | null
}>()

/*
 * Отсеиваем повреждённые записи, хотя форму стережёт ограничение в базе.
 * Оно появилось вместе с колонкой, а строки могли быть записаны до него или
 * мимо неё — прямым SQL. Цена проверки нулевая, цена пропуска — пустая
 * строка в карточке.
 */
const rows = computed<BrandFact[]>(() =>
  (props.facts ?? []).filter(f => f?.k?.trim() && f?.v?.trim()),
)
</script>

<template>
  <aside v-if="rows.length" class="bfc">
    <h3 class="bfc__title">
      Коротко о бренде
    </h3>
    <dl class="bfc__list">
      <div v-for="fact in rows" :key="fact.k" class="bfc__row">
        <dt class="bfc__key">
          {{ fact.k }}
        </dt>
        <dd class="bfc__value">
          {{ fact.v }}
        </dd>
      </div>
    </dl>
  </aside>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bfc {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 26px;
    background: linear-gradient(160deg, #f7f9fc, #eef2f8);
    box-shadow:
      inset 0 1px 0 #fff,
      0 8px 24px rgb(15 23 42 / 0.06);
  }

  .bfc__title {
    margin: 0 0 2px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 15px;
  }

  .bfc__list {
    margin: 0;
  }

  .bfc__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 9px 0;
    border-bottom: 1px solid rgb(15 23 42 / 0.07);
  }

  /* У последней строки черта лишняя — под ней край карточки. */
  .bfc__row:last-child {
    border-bottom: none;
  }

  .bfc__key {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 13.5px;
  }

  .bfc__value {
    margin: 0;
    color: var(--foreground);
    font-weight: 600;
    font-size: 13.5px;
    text-align: right;
  }

  @media (min-width: 900px) {
    .bfc {
      padding: 28px 30px;
    }
  }
}
</style>
