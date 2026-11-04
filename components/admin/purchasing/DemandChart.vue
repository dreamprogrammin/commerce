<script setup lang="ts">
import { useElementSize } from '@vueuse/core'
import { formatVolume, monthLabel } from '@/utils/marketDemand'
import { plural } from '@/utils/restockOrder'

/*
 * Спрос по всем темам помесячно — одна линия с заливкой (дашборд «Умный
 * закуп»). Месяц показывают наведение и стрелки с клавиатуры; те же числа —
 * таблицей под графиком, так что подсказка ничего не прячет.
 */
const props = defineProps<{
  series: number[]
  /** Месяц каждой точки, `YYYY-MM-01` */
  months: string[]
}>()

const SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const PAD = { top: 12, right: 10, bottom: 24, left: 48 }
const PLOT_H = 150

const box = ref<HTMLElement | null>(null)
const { width } = useElementSize(box)
const tipEl = ref<HTMLElement | null>(null)
const { width: tipW } = useElementSize(tipEl, undefined, { box: 'border-box' })
const height = PLOT_H + PAD.top + PAD.bottom

// Верх шкалы — круглое число: 1 / 2 / 3 / 4 / 5 / 6 / 8 / 10 × 10ⁿ
const top = computed(() => {
  const max = Math.max(...props.series, 1)
  const p = 10 ** Math.floor(Math.log10(max))
  return ([1, 2, 3, 4, 5, 6, 8, 10].find(k => k * p >= max) ?? 10) * p
})
const compact = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 })
const ticks = computed(() => [0, top.value / 2, top.value].map(v => ({ v, y: y(v), label: compact.format(v) })))

const plotW = computed(() => Math.max(width.value - PAD.left - PAD.right, 1))
function x(i: number) {
  const n = props.series.length
  return PAD.left + (n > 1 ? i * plotW.value / (n - 1) : plotW.value / 2)
}
function y(v: number) {
  return PAD.top + PLOT_H - Math.max(v, 0) / top.value * PLOT_H
}

const line = computed(() => props.series.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(''))
const area = computed(() => {
  const n = props.series.length
  return n ? `${line.value}L${x(n - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : ''
})

// Подписи месяцев — каждый шестой от последнего, чтобы не налезали
const xLabels = computed(() => props.months.flatMap((m, i) => {
  if ((props.months.length - 1 - i) % 6)
    return []
  const [yy, mm] = m.split('-')
  return [{ i, label: `${SHORT[Number(mm) - 1]} ${yy}` }]
}))

const last = computed(() => props.series.length - 1)
// Подпись последней точки — над линией, если она пришла снизу, и под ней, если сверху
const endBelow = computed(() => last.value > 0 && props.series[last.value - 1]! > props.series[last.value]!)

const active = ref<number | null>(null)
function onMove(e: PointerEvent) {
  const rect = (e.currentTarget as Element).getBoundingClientRect()
  const n = props.series.length
  const i = Math.round((e.clientX - rect.left) / (rect.width || 1) * (n - 1))
  active.value = Math.min(Math.max(i, 0), n - 1)
}
// Палец уходит с экрана — подсказка остаётся до касания в другом месте
function onLeave(e: PointerEvent) {
  if (e.pointerType === 'mouse')
    active.value = null
}
function onFocus() {
  active.value ??= last.value
}
function onKey(e: KeyboardEvent) {
  const n = props.series.length
  const i = active.value ?? n - 1
  const next = { ArrowLeft: i - 1, ArrowRight: i + 1, Home: 0, End: n - 1 }[e.key]
  if (next == null)
    return
  e.preventDefault()
  active.value = Math.min(Math.max(next, 0), n - 1)
}

const searches = (v: number) => `${formatVolume(v)} ${plural(v, 'поиск', 'поиска', 'поисков')}`
const tip = computed(() => {
  const i = active.value
  if (i == null)
    return null
  // Подсказка не выходит за края графика — по её настоящей ширине
  const half = tipW.value / 2
  const left = Math.min(Math.max(x(i), half), width.value - half)
  return { i, left, month: monthLabel(props.months[i]), value: searches(props.series[i]!) }
})
const summary = computed(() =>
  `Спрос по месяцам: с ${monthLabel(props.months[0])} по ${monthLabel(props.months.at(-1))}, в последний месяц ${searches(props.series.at(-1) ?? 0)}`)
</script>

<template>
  <div>
    <div
      ref="box"
      class="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
      tabindex="0"
      :aria-label="`${summary}. Стрелки влево и вправо — по месяцам`"
      data-testid="demand-chart"
      @keydown="onKey"
      @focus="onFocus"
      @blur="active = null"
    >
      <!-- Ширина 100%, а не числом: число держало бы ширину страницы, когда окно сужают -->
      <svg v-if="width > 0" width="100%" :height="height" :viewBox="`0 0 ${width} ${height}`" class="block text-primary" role="img" :aria-label="summary">
        <g class="text-muted-foreground">
          <template v-for="t in ticks" :key="t.v">
            <line :x1="PAD.left" :x2="width - PAD.right" :y1="t.y" :y2="t.y" class="stroke-border" stroke-width="1" />
            <text :x="PAD.left - 8" :y="t.y" dy="0.32em" text-anchor="end" class="fill-current text-[11px] tabular-nums">{{ t.label }}</text>
          </template>
          <text
            v-for="l in xLabels"
            :key="l.i"
            :x="x(l.i)"
            :y="height - 6"
            :text-anchor="l.i === last ? 'end' : l.i === 0 ? 'start' : 'middle'"
            class="fill-current text-[11px]"
          >{{ l.label }}</text>
        </g>

        <path :d="area" fill="currentColor" fill-opacity="0.1" />
        <path :d="line" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />

        <template v-if="tip">
          <line :x1="x(tip.i)" :x2="x(tip.i)" :y1="PAD.top" :y2="PAD.top + PLOT_H" class="stroke-muted-foreground/50" stroke-width="1" />
          <circle :cx="x(tip.i)" :cy="y(series[tip.i]!)" r="4" fill="currentColor" class="stroke-card" stroke-width="2" />
        </template>
        <template v-else>
          <circle :cx="x(last)" :cy="y(series[last]!)" r="4" fill="currentColor" class="stroke-card" stroke-width="2" />
          <text
            :x="x(last) - 8"
            :y="y(series[last]!) + (endBelow ? 16 : -10)"
            text-anchor="end"
            class="fill-foreground text-xs font-semibold"
            data-testid="demand-chart-end"
          >{{ formatVolume(series[last]) }}</text>
        </template>

        <rect
          :x="PAD.left"
          :y="PAD.top"
          :width="plotW"
          :height="PLOT_H"
          fill="transparent"
          @pointermove="onMove"
          @pointerdown="onMove"
          @pointerleave="onLeave"
        />
      </svg>

      <div
        v-if="tip"
        ref="tipEl"
        class="pointer-events-none absolute top-0 -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-sm"
        :style="{ left: `${tip.left}px` }"
        aria-live="polite"
        data-testid="demand-chart-tip"
      >
        <span class="text-muted-foreground">{{ tip.month }}</span> · <b class="font-semibold">{{ tip.value }}</b>
      </div>
    </div>

    <details class="mt-2 text-sm">
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
