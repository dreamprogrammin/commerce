<script setup lang="ts">
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { monthGrid, monthTitle, shiftMonth } from '@/utils/supplierOrders'

/*
 * Календарь поставок (27 ноября 2026) — месяц сеткой с понедельника. Два
 * вида: обзор (у дня — сколько поставок и подписи, клик выбирает день) и
 * выбор даты (дни вне `min`…`max` закрыты). Месяц листается стрелками.
 */
const props = withDefaults(defineProps<{
  today: string
  /** Выбранный день, ГГГГ-ММ-ДД */
  selected?: string | null
  /** День → сколько поставок и кто (подпись под числом) */
  marks?: Map<string, { count: number, labels: string[], late?: boolean }>
  min?: string | null
  max?: string | null
  /** Подписи поставщиков в ячейках — на широком экране */
  labels?: boolean
}>(), { selected: null, marks: () => new Map(), min: null, max: null, labels: false })

const emit = defineEmits<{ select: [day: string] }>()

const month = ref((props.selected ?? props.today).slice(0, 7))
// Выбрали день в другом месяце снаружи — показать его месяц
watch(() => props.selected, (day) => {
  if (day && day.slice(0, 7) !== month.value)
    month.value = day.slice(0, 7)
})

const weeks = computed(() => monthGrid(month.value))
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const closed = (day: string) => Boolean((props.min && day < props.min) || (props.max && day > props.max))
const canBack = computed(() => !props.min || shiftMonth(month.value, -1) >= props.min.slice(0, 7))
const canForward = computed(() => !props.max || shiftMonth(month.value, 1) <= props.max.slice(0, 7))

function pick(day: string) {
  if (!closed(day))
    emit('select', day)
}
</script>

<template>
  <div class="select-none" data-testid="delivery-calendar" :data-month="month">
    <div class="mb-2 flex items-center justify-between gap-2">
      <Button type="button" variant="ghost" size="icon" class="h-8 w-8" :disabled="!canBack" aria-label="Предыдущий месяц" data-testid="calendar-prev" @click="month = shiftMonth(month, -1)">
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <div class="text-sm font-medium" data-testid="calendar-title">
        {{ monthTitle(month) }}
      </div>
      <Button type="button" variant="ghost" size="icon" class="h-8 w-8" :disabled="!canForward" aria-label="Следующий месяц" data-testid="calendar-next" @click="month = shiftMonth(month, 1)">
        <ChevronRight class="h-4 w-4" />
      </Button>
    </div>
    <div class="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
      <span v-for="w in WEEKDAYS" :key="w" class="py-1">{{ w }}</span>
    </div>
    <div class="grid grid-cols-7 gap-1">
      <template v-for="week in weeks" :key="week[0]!.day">
        <button
          v-for="cell in week"
          :key="cell.day"
          type="button"
          class="relative flex flex-col items-center rounded-md border border-transparent px-0.5 py-1 text-sm transition-colors"
          :class="[
            // Подписи видны только на широком экране — там и высота под них
            labels ? 'min-h-11 md:min-h-16' : 'min-h-10',
            cell.inMonth ? '' : 'text-muted-foreground/50',
            closed(cell.day) ? 'cursor-not-allowed opacity-40' : 'hover:bg-muted',
            cell.day === selected ? 'border-primary bg-primary/10' : '',
            cell.day === today && cell.day !== selected ? 'border-border' : '',
          ]"
          :disabled="closed(cell.day)"
          :aria-label="cell.day"
          :aria-pressed="cell.day === selected"
          data-testid="calendar-day"
          :data-day="cell.day"
          :data-count="marks.get(cell.day)?.count ?? 0"
          @click="pick(cell.day)"
        >
          <span class="tabular-nums" :class="{ 'font-semibold': cell.day === today }">{{ cell.date }}</span>
          <span
            v-if="marks.get(cell.day)?.count"
            class="mt-0.5 rounded-full px-1.5 text-[11px] font-medium leading-4 tabular-nums"
            :class="marks.get(cell.day)!.late ? 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100' : 'bg-primary text-primary-foreground'"
            data-testid="calendar-mark"
          >{{ marks.get(cell.day)!.count }}</span>
          <span v-if="labels && marks.get(cell.day)?.labels.length" class="mt-0.5 hidden w-full truncate text-[10px] leading-3 text-muted-foreground md:block">
            {{ marks.get(cell.day)!.labels.join(', ') }}
          </span>
        </button>
      </template>
    </div>
  </div>
</template>
