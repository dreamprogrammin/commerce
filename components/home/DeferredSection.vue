<script setup lang="ts">
/**
 * Секция, которая рисуется по мере подхода, а не сразу.
 *
 * Зачем: при переходе внутри сайта серверной разметки нет — Vue строит дерево
 * заново, и секции ниже экрана платят полную цену стилей, раскладки и
 * отрисовки. Замер 28 августа (390px, CPU ×4): переход на главную целиком
 * 493 мс, она же без пяти секций ниже экрана — 238 мс.
 *
 * Почему не `hydrate-on-visible` из Nuxt: он откладывает ГИДРАЦИЮ, то есть
 * оживление готовой серверной разметки. При переходе внутри сайта гидрировать
 * нечего, и он не срабатывает — `hydrate-check.mjs` показывает сразу после
 * возврата все 1533 узла. На первой загрузке он срабатывает, но делает хуже:
 * 1716 мс блокировки против 1525, каждая секция становится отдельным куском,
 * который надо дозапросить.
 *
 * Почему не `content-visibility`: тоже оставляет узлы в документе, экономя
 * только отрисовку. Пробовали и сняли 28 августа — см. docs/HANDOFF.md.
 */
const props = withDefaults(defineProps<{
  /** Высота резерва на узком экране, px. */
  h: number
  /** Высота резерва от 1024px, px. Если не задана — берётся `h`. */
  hLg?: number
  /**
   * Рисовать ли секцию на сервере.
   *
   * По умолчанию да: содержимое попадает в HTML, и поиск его видит. При этом
   * экономится только переход — на первой загрузке секция строится как обычно.
   *
   * `false` убирает секцию из серверной разметки совсем: экономится и первая
   * загрузка, но содержимое из HTML пропадает. Ставить только там, где оно
   * достижимо иначе (карта сайта, страницы каталога), и никогда — на текст,
   * ради которого страницу открывают.
   */
  ssr?: boolean
}>(), { ssr: true })

const nuxtApp = useNuxtApp()

/** Показывать ли содержимое. */
const shown = ref(props.ssr && (import.meta.server || nuxtApp.isHydrating))

/**
 * Снят ли резерв высоты.
 *
 * Снимать его в момент показа нельзя: содержимое секции приезжает запросом и
 * появляется не сразу. 28 августа на этом «Хиты продаж» схлопывались на 946px
 * прямо в кадре и роняли десктопный CLS с 0.0082 до 0.1393. Поэтому резерв
 * держится, пока содержимое до него не дорастёт.
 */
const settled = ref(false)

const root = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)

let io: IntersectionObserver | null = null
let ro: ResizeObserver | null = null

function stopIo() {
  io?.disconnect()
  io = null
}

function stopRo() {
  ro?.disconnect()
  ro = null
}

function reserveFor(): number {
  const lg = props.hLg ?? props.h
  return window.innerWidth >= 1024 ? lg : props.h
}

function watchUntilGrown() {
  if (!inner.value) {
    settled.value = true
    return
  }
  // Высота берётся из самого события наблюдателя, а не через offsetHeight:
  // чтение размера в обработчике заставляет браузер пересчитать раскладку
  // синхронно, и на пяти секциях сразу это съедало весь выигрыш — блокировка
  // возвращалась с 982 мс к 1524 мс (замер 28 августа).
  const need = reserveFor()
  ro = new ResizeObserver((entries) => {
    for (const e of entries) {
      const box = e.borderBoxSize?.[0]?.blockSize ?? e.contentRect.height
      if (box >= need) {
        settled.value = true
        stopRo()
        return
      }
    }
  })
  ro.observe(inner.value)
}

onMounted(() => {
  // Секция приехала из серверной разметки: содержимое уже на месте, держать
  // под ним резерв незачем. Наблюдатель тут не бесплатный — на пяти секциях
  // сразу он стоил 336 мс блокировки (замер 28 августа).
  if (shown.value) {
    settled.value = true
    return
  }
  if (!root.value)
    return
  // Запас в 600px: секция должна успеть нарисоваться до того, как въедет в
  // кадр, иначе человек увидит пустое место вместо содержимого.
  io = new IntersectionObserver(
    (entries) => {
      if (!entries.some(e => e.isIntersecting))
        return
      shown.value = true
      stopIo()
      nextTick(watchUntilGrown)
    },
    { rootMargin: '600px 0px' },
  )
  io.observe(root.value)
})

onBeforeUnmount(() => {
  stopIo()
  stopRo()
})
</script>

<template>
  <div
    ref="root"
    :class="{ 'ds-hold': !settled }"
    :style="!settled ? { '--ds-h': `${props.h}px`, '--ds-h-lg': `${props.hLg ?? props.h}px` } : undefined"
  >
    <div ref="inner">
      <slot v-if="shown" />
    </div>
  </div>
</template>

<style scoped>
.ds-hold {
  min-height: var(--ds-h);
}

@media (min-width: 1024px) {
  .ds-hold {
    min-height: var(--ds-h-lg);
  }
}
</style>
