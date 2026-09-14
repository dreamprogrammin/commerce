<script setup lang="ts">
/**
 * Двойной ползунок диапазона — макет `RangeFilter.dc.html`.
 *
 * Полоса с «кирпичной» подложкой, подписью слева и двумя бегунками. Сам
 * бегунок невидим (88×44 без фона), а видимой ручкой служит пузырёк со
 * значением — поэтому дорожка вжата на 44px с каждой стороны, и положение
 * считается как `44px + доля × (100% − 88px)`.
 *
 * Когда бегунки сходятся ближе, чем на `mergeAt` от шкалы, два пузырька
 * заменяются одним общим: иначе они наезжают друг на друга и числа не
 * прочитать. У краёв общий пузырёк прижимается к краю, а не уезжает за него.
 */
import { pluralRu } from '@/utils/seoDescription'

export type RangeFilterTone = 'blue' | 'yellow' | 'green'

const props = withDefaults(defineProps<{
  label: string
  min: number
  max: number
  step?: number
  lo: number
  hi: number
  tone?: RangeFilterTone
  /** Приписка к числу: «₸». */
  unit?: string
  /**
   * Склоняемая приписка: [год, года, лет]. Нужна возрасту — «4 лет» по-русски
   * не читается, а в макете приписка приклеена к числу как есть.
   */
  unitForms?: [string, string, string]
  /** Что дописать к верхнему значению, когда оно упёрлось в максимум. */
  maxSuffix?: string
  /** Разбивать ли тысячи неразрывным пробелом — для цен. */
  thousands?: boolean
  /** Низкая полоса: в плотной карточке фильтра. */
  compact?: boolean
  /** Доля шкалы, ближе которой пузырьки сливаются в один. */
  mergeAt?: number
}>(), {
  step: 1,
  tone: 'blue',
  unit: '',
  unitForms: undefined,
  maxSuffix: '+',
  thousands: false,
  compact: false,
  mergeAt: 0.2,
})

const emit = defineEmits<{
  'update:lo': [value: number]
  'update:hi': [value: number]
}>()

const clampedLo = computed(() => Math.min(Math.max(props.lo, props.min), props.max))
const clampedHi = computed(() => Math.min(Math.max(props.hi, props.min), props.max))

function fraction(value: number) {
  return props.max === props.min ? 0 : (value - props.min) / (props.max - props.min)
}

const fLo = computed(() => fraction(clampedLo.value))
const fHi = computed(() => fraction(clampedHi.value))
/*
 * Ширина дорожки нужна второму правилу слияния. На сервере она неизвестна —
 * там работает только доля шкалы, а после отрисовки добавляется проверка в
 * пикселях: подписи у нас длиннее макетных («79 900 ₸» против «16»), и на
 * телефоне два пузырька наезжают друг на друга задолго до порога в долях.
 */
const areaRef = ref<HTMLElement | null>(null)
const areaWidth = ref(0)

onMounted(() => {
  if (!areaRef.value)
    return
  const observer = new ResizeObserver(([entry]) => {
    areaWidth.value = entry?.contentRect.width ?? 0
  })
  observer.observe(areaRef.value)
  onBeforeUnmount(() => observer.disconnect())
})

/** Насколько близко могут сойтись центры пузырьков, прежде чем сольются. */
const MIN_CAP_GAP = 118

const merged = computed(() => {
  if (fHi.value - fLo.value < props.mergeAt)
    return true
  const travel = Math.max(areaWidth.value - 88, 0)
  return travel > 0 && (fHi.value - fLo.value) * travel < MIN_CAP_GAP
})

function format(value: number) {
  const rounded = String(Math.round(value))
  // Неразрывный пробел: «79 900» не должно разрываться переносом внутри пузырька.
  return props.thousands ? rounded.replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') : rounded
}

function caption(value: number, isHi = false) {
  if (isHi && value >= props.max && props.maxSuffix)
    return format(value) + props.maxSuffix
  const forms = props.unitForms
  const unit = forms ? pluralRu(Math.round(value), forms[0], forms[1], forms[2]) : props.unit
  return format(value) + (unit ? `\u00A0${unit}` : '')
}

const loLabel = computed(() => caption(clampedLo.value))
const hiLabel = computed(() => caption(clampedHi.value, true))
const mergedLabel = computed(() => `${loLabel.value} – ${hiLabel.value}`)

/** Положение пузырька по доле шкалы. */
function capPosition(f: number) {
  return { left: `calc(44px + ${f} * (100% - 88px))` }
}

const fillStyle = computed(() => ({
  left: `calc(44px + ${fLo.value} * (100% - 88px))`,
  width: `calc(${Math.max(fHi.value - fLo.value, 0)} * (100% - 88px))`,
}))

/*
 * Общий пузырёк у краёв прижимается к краю: посередине он центрируется по
 * середине диапазона, но у самого конца шкалы вылезал бы за полосу.
 */
const mergedStyle = computed(() => {
  const center = (fLo.value + fHi.value) / 2
  if (center <= 0.28)
    return { left: '0', transform: 'translateY(-50%)' }
  if (center >= 0.72)
    return { right: '0', transform: 'translateY(-50%)' }
  return { left: `calc(44px + ${center} * (100% - 88px))`, transform: 'translate(-50%, -50%)' }
})

function onLo(event: Event) {
  const value = Math.min(Number((event.target as HTMLInputElement).value), clampedHi.value)
  emit('update:lo', value)
}

function onHi(event: Event) {
  const value = Math.max(Number((event.target as HTMLInputElement).value), clampedLo.value)
  emit('update:hi', value)
}
</script>

<template>
  <div class="rf" :class="[`rf--${tone}`, { 'rf--compact': compact }]">
    <span class="rf__studs" aria-hidden="true" />
    <span class="rf__label">{{ label }}</span>

    <span ref="areaRef" class="rf__area">
      <span class="rf__track" />
      <span class="rf__fill" :style="fillStyle" />

      <span v-show="!merged" class="rf__cap" :style="capPosition(fLo)">{{ loLabel }}</span>
      <span v-show="!merged" class="rf__cap" :style="capPosition(fHi)">{{ hiLabel }}</span>
      <span v-show="merged" class="rf__cap rf__cap--merged" :style="mergedStyle">{{ mergedLabel }}</span>

      <input
        class="rf__input"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="clampedLo"
        :aria-label="`${label} от`"
        @input="onLo"
      >
      <input
        class="rf__input"
        type="range"
        :min="min"
        :max="max"
        :step="step"
        :value="clampedHi"
        :aria-label="`${label} до`"
        @input="onHi"
      >
    </span>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .rf {
    position: relative;
    display: flex;
    align-items: center;
    gap: 20px;
    height: 70px;
    padding: 0 20px;
    border: 1px solid var(--rf-border);
    border-radius: 18px;
    background: var(--rf-bg);
    overflow: hidden;
  }

  .rf--compact {
    gap: 14px;
    height: 64px;
    padding: 0 20px 0 16px;
  }

  /* Тона из макета. */
  .rf--blue {
    --rf-bg: linear-gradient(120deg, #eef5ff, #e0ecff);
    --rf-border: rgb(43 127 255 / 0.22);
    --rf-ink: var(--primary);
    --rf-stud: rgb(43 127 255 / 0.1);
    --rf-track: rgb(11 74 143 / 0.16);
    --rf-fill: var(--primary);
    --rf-cap: var(--primary);
    --rf-cap-ink: #fff;
  }

  .rf--yellow {
    --rf-bg: linear-gradient(120deg, #fff8e0, #fff1c4);
    --rf-border: rgb(253 199 0 / 0.45);
    --rf-ink: #8a6300;
    --rf-stud: rgb(191 140 0 / 0.13);
    --rf-track: rgb(138 99 0 / 0.16);
    --rf-fill: #fdc700;
    --rf-cap: #0b2444;
    --rf-cap-ink: #fff;
  }

  .rf--green {
    --rf-bg: linear-gradient(120deg, #e8fbf3, #d6f5e8);
    --rf-border: rgb(0 188 125 / 0.35);
    --rf-ink: #00694a;
    --rf-stud: rgb(0 140 94 / 0.12);
    --rf-track: rgb(0 105 74 / 0.16);
    --rf-fill: var(--success);
    --rf-cap: #00503a;
    --rf-cap-ink: #fff;
  }

  .rf__studs {
    position: absolute;
    inset: 0;
    background-image: radial-gradient(circle at 11px 11px, var(--rf-stud) 4.5px, rgb(0 0 0 / 0) 5.5px);
    background-size: 34px 34px;
    pointer-events: none;
  }

  .rf__label {
    position: relative;
    flex: none;
    color: var(--rf-ink);
    font-weight: 800;
    font-size: 15px;
    letter-spacing: -0.01em;
  }

  .rf--compact .rf__label {
    font-size: 14px;
  }

  .rf__area {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 44px;
  }

  .rf__track,
  .rf__fill {
    position: absolute;
    top: 19px;
    height: 6px;
    border-radius: 999px;
  }

  /* Дорожка вжата на ширину половины бегунка с каждой стороны. */
  .rf__track {
    right: 44px;
    left: 44px;
    background: var(--rf-track);
  }

  .rf__fill {
    background: var(--rf-fill);
  }

  /* Пузырёк со значением и есть видимая ручка. */
  .rf__cap {
    position: absolute;
    top: 50%;
    display: grid;
    place-content: center;
    min-width: 46px;
    height: 38px;
    padding: 0 13px;
    border-radius: 12px;
    background: var(--rf-cap);
    box-shadow: 0 3px 10px rgb(6 20 44 / 0.22);
    color: var(--rf-cap-ink);
    font-weight: 700;
    font-size: 13.5px;
    white-space: nowrap;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .rf__cap--merged {
    padding: 0 14px;
  }

  /*
   * Сам `input` прозрачен и не ловит события — их берёт только бегунок.
   * Иначе верхний из двух перехватывал бы нажатия по всей ширине и нижний
   * стал бы недоступен.
   */
  .rf__input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 44px;
    margin: 0;
    background: transparent;
    outline: none;
    pointer-events: none;
    appearance: none;
  }

  .rf__input::-webkit-slider-runnable-track {
    height: 44px;
    background: transparent;
  }

  .rf__input::-moz-range-track {
    height: 44px;
    background: transparent;
  }

  .rf__input::-webkit-slider-thumb {
    width: 88px;
    height: 44px;
    border: none;
    border-radius: 14px;
    background: transparent;
    box-shadow: none;
    cursor: grab;
    pointer-events: auto;
    appearance: none;
  }

  .rf__input::-moz-range-thumb {
    width: 88px;
    height: 44px;
    border: none;
    border-radius: 14px;
    background: transparent;
    box-shadow: none;
    cursor: grab;
    pointer-events: auto;
  }

  .rf__input:active::-webkit-slider-thumb {
    cursor: grabbing;
  }
}
</style>
