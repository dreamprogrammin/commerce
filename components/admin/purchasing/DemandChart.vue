<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { formatVolume, monthLabel, trendLabel } from '@/utils/marketDemand'

/*
 * Спрос по всем темам помесячно — столбиками (дашборд «Умный закуп», макет
 * Canvas-2.dc.html, 9.11.2026). Показывается последние 12 месяцев или весь
 * ряд; горит последний месяц или тот, что под мышью / выбран стрелками, и над
 * ним подсказка: месяц, поисков, к тому же месяцу год назад. Те же числа —
 * таблицей под графиком, так что подсказка ничего не прячет.
 */
const props = defineProps<{
  /** Весь ряд — от старого месяца к новому; к нему считается «за год» */
  series: number[]
  /** Месяц каждой точки, `YYYY-MM-01` */
  months: string[]
  /** Сколько последних месяцев показать */
  range: number
}>()

const SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const PLOT_H = 200

const off = computed(() => Math.max(0, props.series.length - props.range))
const shown = computed(() => props.series.slice(off.value))
const n = computed(() => shown.value.length)
const last = computed(() => n.value - 1)

// Верх шкалы — круглое число: 1 / 2 / 3 / 4 / 5 / 6 / 8 / 10 × 10ⁿ
const top = computed(() => {
  const max = Math.max(...shown.value, 1)
  const p = 10 ** Math.floor(Math.log10(max))
  return ([1, 2, 3, 4, 5, 6, 8, 10].find(k => k * p >= max) ?? 10) * p
})
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
const ticks = computed(() => [top.value, top.value / 2, 0].map(v => ({ v, pct: (1 - v / top.value) * 100, label: v ? compact.format(v) : '0' })))
const pct = (v: number) => Math.max(v, 0) / top.value * 100

const plot = ref<HTMLElement | null>(null)
const { width } = useElementSize(plot)
const barW = computed(() => width.value / Math.max(n.value, 1))
function short(i: number) {
  const [yy, mm] = props.months[off.value + i]!.split('-')
  return n.value <= 12 ? SHORT[Number(mm) - 1]! : `${SHORT[Number(mm) - 1]} ${yy}`
}
// Подписи — через сколько столбиков влезают: «окт» около 28px, «окт 2026» — около 60px; отсчёт от последнего
const labelStep = computed(() => {
  const need = n.value <= 12 ? 30 : 64
  return [1, 2, 3, 4, 6, 12].find(k => k * barW.value >= need) ?? 12
})
const labelled = (i: number) => (last.value - i) % labelStep.value === 0

const hover = ref<number | null>(null)
const active = computed(() => hover.value ?? last.value)
watch(() => props.range, () => {
  hover.value = null
})
function onEnter(e: PointerEvent, i: number) {
  if (e.pointerType === 'mouse')
    hover.value = i
}
function onLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse')
    hover.value = null
}
function onKey(e: KeyboardEvent) {
  const i = active.value
  const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: last.value }[e.key]
  if (next == null)
    return
  e.preventDefault()
  hover.value = Math.min(Math.max(next, 0), last.value)
}

const tip = computed(() => {
  const i = active.value
  const v = shown.value[i]
  if (v == null)
    return null
  const prev = props.series[off.value + i - 12]
  const yoy = prev ? Math.round((v / prev - 1) * 100) : null
  // У краёв подсказка прижата к краю графика, а не выходит за него
  const align = i >= n.value - 2 ? 'right-0' : i <= 1 ? 'left-0' : 'left-1/2 -translate-x-1/2'
  return { i, month: monthLabel(props.months[off.value + i]), value: formatVolume(v), yoy: yoy == null ? null : `${trendLabel(yoy)} за год`, up: (yoy ?? 0) >= 0, align, bottom: pct(v) }
})
const summary = computed(() =>
  `Спрос по месяцам: с ${monthLabel(props.months[off.value])} по ${monthLabel(props.months.at(-1))}, в последний месяц ${formatVolume(props.series.at(-1))} поисков`)
</script>

<template>
  <div>
    <div
      class="relative ml-[52px] mt-14 mb-[30px] rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4"
      tabindex="0"
      role="group"
      :aria-label="`${summary}. Стрелки влево и вправо — по месяцам`"
      data-testid="demand-chart"
      @keydown="onKey"
      @blur="hover = null"
    >
      <div ref="plot" class="relative" :style="{ height: `${PLOT_H}px` }">
        <div
          v-for="t in ticks"
          :key="t.v"
          class="absolute inset-x-0 border-t border-neutral-200"
          :class="t.v ? 'border-dashed' : ''"
          :style="{ top: `${t.pct}%` }"
        >
          <span class="absolute right-full -top-2 mr-2.5 whitespace-nowrap text-xs text-muted-foreground tabular-nums">{{ t.label }}</span>
        </div>

        <div class="absolute inset-0 flex" @pointerleave="onLeave">
          <div
            v-for="(v, i) in shown"
            :key="months[off + i]"
            class="relative flex flex-1 cursor-pointer items-end justify-center"
            :class="n > 12 ? 'px-[3px]' : 'px-1.5'"
            data-testid="demand-chart-bar"
            :data-active="i === active ? '' : undefined"
            @pointerenter="onEnter($event, i)"
            @pointerdown="hover = i"
          >
            <div
              class="w-full max-w-9 rounded-lg transition-colors"
              :class="i === active ? 'bg-primary shadow-[0_6px_16px_rgba(43,127,255,0.3)]' : 'bg-primary/15'"
              :style="{ height: `${pct(v)}%` }"
            />
            <span
              v-if="labelled(i)"
              class="absolute top-full left-1/2 mt-2.5 -translate-x-1/2 whitespace-nowrap text-xs"
              :class="i === active ? 'font-semibold text-foreground' : 'text-muted-foreground'"
              data-testid="demand-chart-label"
            >{{ short(i) }}</span>
          </div>
        </div>

        <div
          v-if="tip"
          class="pointer-events-none absolute z-[2] flex flex-col gap-0.5 whitespace-nowrap rounded-xl bg-foreground px-3 py-2 text-white shadow-lg"
          :class="tip.align"
          :style="{
            bottom: `calc(${tip.bottom}% + 12px)`,
            ...(tip.align.startsWith('left-1/2') ? { left: `${(tip.i + 0.5) / n * 100}%` } : {}),
          }"
          aria-live="polite"
          data-testid="demand-chart-tip"
        >
          <span class="text-xs opacity-70" data-testid="demand-chart-tip-month">{{ tip.month }}</span>
          <span class="text-sm font-bold tabular-nums" data-testid="demand-chart-tip-value">{{ tip.value }}</span>
          <span v-if="tip.yoy" class="text-xs font-semibold" :class="tip.up ? 'text-green-300' : 'text-red-300'" data-testid="demand-chart-tip-yoy">{{ tip.yoy }}</span>
        </div>
      </div>
    </div>

    <details class="text-sm">
      <summary class="cursor-pointer text-xs text-muted-foreground">
        По месяцам — таблицей
      </summary>
      <table class="mt-2 w-full max-w-sm text-xs" data-testid="demand-chart-table">
        <thead>
          <tr class="text-muted-foreground">
            <th class="py-1 text-left font-normal">
              Месяц
            </th>
            <th class="py-1 text-right font-normal">
              Поисков
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(v, i) in series" :key="months[i]" class="border-t">
            <td class="py-1">
              {{ monthLabel(months[i]) }}
            </td>
            <td class="py-1 text-right tabular-nums">
              {{ formatVolume(v) }}
            </td>
          </tr>
        </tbody>
      </table>
    </details>
  </div>
</template>
