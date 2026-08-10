<script setup lang="ts">
import {
  isOrderCancelled,
  ORDER_TRACK_LABELS,
  orderStatusToSegment,
} from '@/utils/orderStatus'

/**
 * Полоса прогресса заказа — пять сегментов с подписями, как в OrderSuccess.dc.html.
 *
 * Вынесена из OrderTrackerLottie отдельным компонентом: на странице успеха
 * макет ставит её не под описанием статуса, а ниже — после номера заказа и
 * даты. Обе страницы собирают блоки в своём порядке.
 */
const props = defineProps<{
  status: string
}>()

const activeIndex = computed(() => orderStatusToSegment(props.status))
const cancelled = computed(() => isOrderCancelled(props.status))
</script>

<template>
  <div class="flex w-full items-start gap-2">
    <span
      v-for="(label, index) in ORDER_TRACK_LABELS"
      :key="label"
      class="flex min-w-0 flex-1 flex-col items-stretch gap-2"
    >
      <span
        class="opb-seg"
        :class="{
          'opb-seg--done': !cancelled && index <= activeIndex,
          'opb-seg--cancelled': cancelled,
        }"
      />
      <span
        class="text-center text-[11px] leading-[1.2]"
        :class="!cancelled && index <= activeIndex
          ? 'font-bold text-primary'
          : 'font-medium text-muted-foreground'"
      >
        {{ label }}
      </span>
    </span>
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
  .opb-seg {
    display: block;
    width: 100%;
    height: 8px;
    flex: none;
    border-radius: 999px;
    background: var(--border);
    box-shadow: inset 0 1px 2px rgb(15 23 42 / 0.08);
    transition: background 0.25s ease;
  }

  /* Пройденные сегменты — тот же синий градиент, что у CTA во всём флоу.
     Литералами, а не через var(--color-blue-*): Tailwind 4 выкидывает
     переменную темы, если её не использует ни одна утилита. */
  .opb-seg--done {
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 3px 8px rgb(43 127 255 / 0.28);
  }

  /* У отменённого заказа полоса гаснет целиком и краснеет — прогресса нет. */
  .opb-seg--cancelled {
    background: color-mix(in srgb, var(--destructive) 20%, transparent);
    box-shadow: none;
  }
}
</style>
