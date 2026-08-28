<script setup lang="ts">
/**
 * Секция, которая при переходе ВНУТРИ сайта рисуется только по мере подхода.
 *
 * Зачем: при переходе на главную SSR-разметки нет — Vue строит всё дерево
 * заново, и секции ниже экрана платят полную цену стилей, раскладки и
 * отрисовки. Замер 28 августа (390px, CPU ×4): вся главная 493 мс, она же без
 * пяти секций ниже экрана — 238 мс. То есть больше половины платы идёт за то,
 * чего человек в этот момент не видит.
 *
 * Почему не `hydrate-on-visible` из Nuxt: он откладывает ГИДРАЦИЮ, то есть
 * оживление уже готовой серверной разметки. При переходе внутри сайта
 * гидрировать нечего, и он не срабатывает — проверено `hydrate-check.mjs`:
 * сразу после возврата на главную в документе уже 1533 узла, вся страница.
 * Выигрыш там был 58 мс из 255 возможных.
 *
 * Почему не `content-visibility`: он тоже оставляет узлы в документе, экономя
 * только отрисовку. Пробовали и сняли 28 августа — см. docs/HANDOFF.md.
 *
 * На сервере и во время первой гидрации секция рисуется СРАЗУ. Это
 * обязательно с двух сторон: разметка клиента должна совпасть с серверной, а
 * содержимое — попасть в HTML, иначе секция пропадёт из поиска.
 */
const props = defineProps<{
  /** Высота заглушки на узком экране, px. */
  h: number
  /** Высота заглушки от 1024px, px. Если не задана — берётся `h`. */
  hLg?: number
}>()

const nuxtApp = useNuxtApp()
const shown = ref(import.meta.server || nuxtApp.isHydrating)
const root = ref<HTMLElement | null>(null)
let io: IntersectionObserver | null = null

function stop() {
  io?.disconnect()
  io = null
}

onMounted(() => {
  if (shown.value || !root.value)
    return
  // Запас в 600px: секция должна успеть нарисоваться до того, как въедет в
  // кадр, иначе человек увидит пустое место вместо содержимого.
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some(e => e.isIntersecting)) {
        shown.value = true
        stop()
      }
    },
    { rootMargin: '600px 0px' },
  )
  io.observe(root.value)
})

onBeforeUnmount(stop)
</script>

<template>
  <div
    ref="root"
    :class="{ 'ds-wait': !shown }"
    :style="!shown ? { '--ds-h': `${props.h}px`, '--ds-h-lg': `${props.hLg ?? props.h}px` } : undefined"
  >
    <slot v-if="shown" />
  </div>
</template>

<style scoped>
.ds-wait {
  min-height: var(--ds-h);
}

@media (min-width: 1024px) {
  .ds-wait {
    min-height: var(--ds-h-lg);
  }
}
</style>
