<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'

/**
 * Полноэкранный просмотр фото.
 *
 * Реализация макета `PhotoViewer.dc.html` из проекта «Прототип для
 * покупателей» (claude.ai/design). Значения — стекло, радиусы, размеры кнопок,
 * пороги жестов — взяты из макета как есть.
 *
 * Отличия от прототипа, все в одну сторону — «так надо для боевого магазина»:
 *  • кадр рисуется <img> с alt и srcset, а не фоном у <span>: фон не даёт ни
 *    альтернативного текста, ни выбора варианта по плотности экрана;
 *  • дальние кадры грузятся лениво (у прототипа все сразу);
 *  • раскладка «мобильный/десктоп» сделана медиазапросами, а не замером
 *    window.innerWidth на resize — она верна ещё до гидратации;
 *  • добавлены role="dialog", возврат фокуса и подпись — прототипу это не
 *    нужно, живому модальному окну обязательно.
 */

export interface PhotoViewerImage {
  src: string
  srcset?: string | null
  sizes?: string | null
  alt?: string | null
  /**
       Мелкий вариант для панели снизу. Без него в плитку 54×54 уедет полный
      файл — на товаре с 14 фото это лишние ~150 КБ на открытие.
   */
  thumb?: string | null
}

const props = withDefaults(
  defineProps<{
    open: boolean
    images: Array<PhotoViewerImage | string>
    /** С какого кадра открывать */
    startIndex?: number
    /** Подпись в шапке — обычно название товара */
    title?: string
    /** Во сколько раз увеличивать по клику (макет: 1.4…3.4) */
    zoomLevel?: number
    /** Показывать подсказку про жесты первые 3,6 секунды */
    showHints?: boolean
  }>(),
  {
    startIndex: 0,
    title: '',
    zoomLevel: 2.2,
    showHints: true,
  },
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  /** Кадр, на котором закрыли, — чтобы лента под просмотром встала на него же */
  'update:index': [index: number]
}>()

const HINT_MS = 3600
const SWIPE_COMMIT_PX = 62
const DISMISS_PX = 110
const AXIS_LOCK_PX = 6
const EDGE_RESISTANCE = 0.32

const slides = computed<PhotoViewerImage[]>(() =>
  props.images
    .map(item => (typeof item === 'string' ? { src: item } : item))
    .filter(item => Boolean(item?.src)),
)

const isOpen = computed(() => props.open && slides.value.length > 0)
const hasMany = computed(() => slides.value.length > 1)
const zoomFactor = computed(() => (props.zoomLevel > 1 ? props.zoomLevel : 2.2))

const index = ref(0)
const zoom = ref(1)
const originX = ref(50)
const originY = ref(50)
const dragX = ref(0)
const dragY = ref(0)
const isDragging = ref(false)
const hintSeen = ref(false)

const isZoomed = computed(() => zoom.value > 1)
// Подсказка различается текстом, а не только шириной, поэтому одними
// медиазапросами тут не обойтись.
const isWide = useMediaQuery('(min-width: 860px)')

const counter = computed(() => `${index.value + 1} / ${Math.max(1, slides.value.length)}`)
const showHint = computed(
  () => props.showHints && !isZoomed.value && !hintSeen.value && slides.value.length > 0,
)
const hintText = computed(() =>
  isWide.value
    ? 'Клик — увеличить, тяните в сторону или вниз'
    : 'Свайп в сторону · вниз — закрыть',
)

/**
 * Смещение ленты. Кадры едут трансформом, а не прокруткой, — и это принципиально:
 * прокручиваемый контейнер Chrome отбирает себе, отменяя указатель
 * (`pointercancel`) на первом же сдвиге. Трансформу такое не грозит, поэтому
 * жесты здесь можно вести указателями, в отличие от ленты миниатюр в
 * ProductGallery.vue.
 */
const trackStyle = computed(() => {
  const shrink = dragY.value > 0 ? ` scale(${Math.max(0.86, 1 - dragY.value / 900)})` : ''
  return {
    transform: `translate3d(calc(${-index.value * 100}% + ${dragX.value}px), ${dragY.value}px, 0)${shrink}`,
    transition: isDragging.value ? 'none' : 'transform .34s cubic-bezier(.22,1,.36,1)',
  }
})

const stageStyle = computed(() => ({
  cursor: isDragging.value ? 'grabbing' : isZoomed.value ? 'zoom-out' : 'zoom-in',
}))

function imageStyle(i: number) {
  return {
    transform: `scale(${i === index.value ? zoom.value : 1})`,
    transformOrigin: `${originX.value}% ${originY.value}%`,
    transition: isDragging.value ? 'none' : 'transform .22s ease',
  }
}

// Соседние кадры грузим сразу, дальние — лениво: у товара их бывает полтора
// десятка, и тянуть все разом при открытии незачем.
function isNear(i: number) {
  return Math.abs(i - index.value) <= 1
}

function altFor(image: PhotoViewerImage, i: number) {
  return image.alt || `${props.title || 'Фото'} — изображение ${i + 1}`
}

function resetView() {
  zoom.value = 1
  originX.value = 50
  originY.value = 50
  dragX.value = 0
  dragY.value = 0
}

function goTo(next: number) {
  const last = slides.value.length - 1
  index.value = Math.max(0, Math.min(next, last))
  resetView()
  emit('update:index', index.value)
}

function step(delta: number) {
  goTo(index.value + delta)
}

function close() {
  emit('update:index', index.value)
  emit('update:open', false)
}

// --- жесты -------------------------------------------------------------------
let pointerActive = false
let axis: 'x' | 'y' | null = null
let moved = false
let startX = 0
let startY = 0

function onPointerDown(event: PointerEvent) {
  if (isZoomed.value)
    return
  pointerActive = true
  axis = null
  moved = false
  startX = event.clientX
  startY = event.clientY
  isDragging.value = true
  try {
    if (event.pointerId != null)
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  catch {}
}

function onPointerMove(event: PointerEvent) {
  // В увеличенном кадре мышь не тащит ленту, а водит точку увеличения.
  if (isZoomed.value) {
    if (event.pointerType === 'touch')
      return
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    if (!rect.width || !rect.height)
      return
    originX.value = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100))
    originY.value = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100))
    return
  }

  if (!pointerActive)
    return

  const dx = event.clientX - startX
  const dy = event.clientY - startY
  if (!axis && (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX))
    axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y'
  if (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX)
    moved = true

  if (axis === 'x') {
    const last = slides.value.length - 1
    const atEdge = (index.value === 0 && dx > 0) || (index.value === last && dx < 0)
    dragX.value = atEdge ? dx * EDGE_RESISTANCE : dx
    dragY.value = 0
  }
  else if (axis === 'y') {
    dragY.value = Math.max(0, dy)
    dragX.value = 0
  }
}

function onPointerUp() {
  if (!pointerActive)
    return
  pointerActive = false

  const draggedX = dragX.value
  const draggedY = dragY.value

  if (draggedY > DISMISS_PX) {
    close()
    return
  }

  isDragging.value = false
  dragX.value = 0
  dragY.value = 0
  if (Math.abs(draggedX) > SWIPE_COMMIT_PX)
    step(draggedX < 0 ? 1 : -1)
}

function onStageClick(event: MouseEvent) {
  // Клик после протяжки — не клик.
  if (moved) {
    moved = false
    return
  }
  if (isZoomed.value) {
    resetView()
    return
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  zoom.value = zoomFactor.value
  originX.value = rect.width ? ((event.clientX - rect.left) / rect.width) * 100 : 50
  originY.value = rect.height ? ((event.clientY - rect.top) / rect.height) * 100 : 50
}

function toggleZoom() {
  if (isZoomed.value) {
    resetView()
    return
  }
  zoom.value = zoomFactor.value
  originX.value = 50
  originY.value = 50
}

// --- клавиатура и блокировка прокрутки ---------------------------------------
function onKeydown(event: KeyboardEvent) {
  if (!isOpen.value)
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
  else if (event.key === 'ArrowRight') {
    event.preventDefault()
    step(1)
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    step(-1)
  }
}

const overlayRef = ref<HTMLElement | null>(null)
let restoreFocusTo: HTMLElement | null = null
let previousBodyOverflow = ''
let hintTimer: ReturnType<typeof setTimeout> | null = null

function lockScroll(on: boolean) {
  if (!import.meta.client)
    return
  if (on) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  else {
    document.body.style.overflow = previousBodyOverflow
  }
}

watch(isOpen, (open) => {
  if (open) {
    const last = Math.max(0, slides.value.length - 1)
    index.value = Math.max(0, Math.min(props.startIndex, last))
    resetView()
    isDragging.value = false
    hintSeen.value = false
    lockScroll(true)
    window.addEventListener('keydown', onKeydown)
    restoreFocusTo = document.activeElement as HTMLElement | null
    nextTick(() => overlayRef.value?.focus())
    if (hintTimer)
      clearTimeout(hintTimer)
    hintTimer = setTimeout(() => {
      hintSeen.value = true
    }, HINT_MS)
  }
  else {
    lockScroll(false)
    window.removeEventListener('keydown', onKeydown)
    if (hintTimer)
      clearTimeout(hintTimer)
    restoreFocusTo?.focus?.()
    restoreFocusTo = null
  }
})

onBeforeUnmount(() => {
  lockScroll(false)
  if (import.meta.client)
    window.removeEventListener('keydown', onKeydown)
  if (hintTimer)
    clearTimeout(hintTimer)
})
</script>

<template>
  <Teleport v-if="isOpen" to="body">
    <div
      ref="overlayRef"
      class="pv-root"
      role="dialog"
      aria-modal="true"
      :aria-label="title ? `Просмотр фото: ${title}` : 'Просмотр фото'"
      tabindex="-1"
    >
      <!-- Шапка: счётчик · название · закрыть -->
      <div class="pv-bar">
        <span class="pv-counter">{{ counter }}</span>
        <span class="pv-heading">{{ title }}</span>
        <button type="button" class="pv-round" aria-label="Закрыть" @click="close">
          <Icon name="lucide:x" class="size-[22px]" />
        </button>
      </div>

      <!-- Кадры -->
      <div class="pv-stage-wrap">
        <div
          class="pv-stage"
          :style="stageStyle"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @click="onStageClick"
        >
          <div class="pv-track" :style="trackStyle">
            <div v-for="(image, i) in slides" :key="`${image.src}-${i}`" class="pv-slot">
              <span class="pv-card">
                <img
                  class="pv-img"
                  :style="imageStyle(i)"
                  :src="image.src"
                  :srcset="image.srcset || undefined"
                  :sizes="image.srcset ? (image.sizes || '92vw') : undefined"
                  :alt="altFor(image, i)"
                  :loading="isNear(i) ? 'eager' : 'lazy'"
                  :fetchpriority="i === index ? 'high' : 'auto'"
                  decoding="async"
                  draggable="false"
                >
              </span>
            </div>
          </div>
        </div>

        <!-- Стрелки: по макету только на широком экране, там же где есть курсор -->
        <template v-if="hasMany">
          <button
            type="button"
            class="pv-round pv-arrow pv-arrow--prev"
            aria-label="Предыдущее фото"
            @click.stop="step(-1)"
          >
            <Icon name="lucide:chevron-left" class="size-6" />
          </button>
          <button
            type="button"
            class="pv-round pv-arrow pv-arrow--next"
            aria-label="Следующее фото"
            @click.stop="step(1)"
          >
            <Icon name="lucide:chevron-right" class="size-6" />
          </button>
        </template>
      </div>

      <!-- Подсказка и стеклянная панель с миниатюрами -->
      <div class="pv-foot">
        <span v-if="showHint" class="pv-hint">{{ hintText }}</span>

        <div class="pv-dock">
          <div v-if="hasMany" class="pv-thumbs">
            <button
              v-for="(image, i) in slides"
              :key="`t-${image.src}-${i}`"
              type="button"
              class="pv-thumb"
              :class="{ 'pv-thumb--active': i === index }"
              :aria-label="`Фото ${i + 1}`"
              :aria-current="i === index"
              @click.stop="goTo(i)"
            >
              <img class="pv-thumb-img" :src="image.thumb || image.src" alt="" loading="lazy" decoding="async">
            </button>
          </div>
          <span v-if="hasMany" class="pv-divider" />

          <button
            type="button"
            class="pv-zoom"
            :aria-label="isZoomed ? 'Уменьшить' : 'Увеличить'"
            :aria-pressed="isZoomed"
            @click.stop="toggleZoom"
          >
            <Icon :name="isZoomed ? 'lucide:zoom-out' : 'lucide:zoom-in'" class="size-[21px]" />
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* Стили намеренно лежат в @layer components — scoped-правило вне слоёв бьёт
   утилиты Tailwind независимо от специфичности.
   Подробности: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .pv-root {
    position: fixed;
    inset: 0;
    z-index: 400;
    display: flex;
    flex-direction: column;
    background: radial-gradient(120% 100% at 50% 0%, rgb(30 41 59 / 0.95), rgb(2 6 23 / 0.97));
    backdrop-filter: blur(16px) saturate(1.15);
    -webkit-backdrop-filter: blur(16px) saturate(1.15);
    animation: pv-fade 0.16s ease;
    outline: none;
  }

  /* ── Шапка ─────────────────────────────────────────────────────────────── */
  .pv-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: clamp(10px, 2vw, 18px) clamp(12px, 2.4vw, 22px);
  }

  .pv-counter {
    flex: none;
    padding: 7px 14px;
    border-radius: 999px;
    background: rgb(255 255 255 / 0.12);
    border: 1px solid rgb(255 255 255 / 0.2);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    font: 700 12.5px var(--font-sans);
    color: rgb(255 255 255 / 0.9);
  }

  .pv-heading {
    flex: 1;
    min-width: 0;
    font: 600 13.5px var(--font-sans);
    color: rgb(255 255 255 / 0.66);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Круглая стеклянная кнопка — закрыть и стрелки */
  .pv-round {
    flex: none;
    width: 46px;
    height: 46px;
    border-radius: 999px;
    border: 1px solid rgb(255 255 255 / 0.22);
    background: rgb(255 255 255 / 0.12);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    color: #fff;
    cursor: pointer;
    display: grid;
    place-content: center;
    transition: background 0.15s ease;
  }

  .pv-round:hover {
    background: rgb(255 255 255 / 0.22);
  }

  .pv-round:focus-visible,
  .pv-thumb:focus-visible,
  .pv-zoom:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  /* ── Кадры ─────────────────────────────────────────────────────────────── */
  .pv-stage-wrap {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .pv-stage {
    position: absolute;
    inset: 0;
    display: flex;
    overflow: hidden;
    /* Жесты ведём сами, браузеру прокрутку не отдаём */
    touch-action: none;
  }

  .pv-track {
    display: flex;
    width: 100%;
    height: 100%;
  }

  /* Дорожки заданы явно, а не оставлены на `auto`.
     У грида с одной неявной строкой строка сама сжимается по содержимому, и
     тогда `height: 100%` у карточки не к чему привязать — кадр разворачивался
     в натуральную величину и вылезал за экран (замер: 820×1093 в окне 900). */
  .pv-slot {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    padding: 12px;
    box-sizing: border-box;
  }

  .pv-card {
    display: grid;
    grid-template-rows: minmax(0, 1fr);
    grid-template-columns: minmax(0, 1fr);
    place-items: center;
    width: 100%;
    height: 100%;
    max-width: 820px;
    overflow: hidden;
    background: #fff;
    border-radius: 24px;
    padding: 14px;
    box-shadow: 0 34px 80px rgb(0 0 0 / 0.5);
    animation: pv-pop 0.2s ease;
  }

  .pv-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
    user-select: none;
  }

  .pv-arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 4;
    width: 48px;
    height: 48px;
    /* По макету стрелки только на широком экране: на телефоне листают свайпом,
       а кнопки съедали бы кадр. */
    display: none;
  }

  .pv-arrow--prev {
    left: 18px;
  }

  .pv-arrow--next {
    right: 18px;
  }

  .pv-arrow:hover {
    background: rgb(255 255 255 / 0.24);
  }

  /* ── Низ: подсказка и стеклянная панель ────────────────────────────────── */
  .pv-foot {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: clamp(10px, 2vw, 20px) 12px calc(env(safe-area-inset-bottom, 0px) + clamp(12px, 2vw, 22px));
  }

  .pv-hint {
    padding: 7px 15px;
    border-radius: 999px;
    background: rgb(2 6 23 / 0.55);
    border: 1px solid rgb(255 255 255 / 0.14);
    font: 600 12.5px var(--font-sans);
    color: rgb(255 255 255 / 0.8);
    white-space: nowrap;
  }

  .pv-dock {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px;
    border-radius: 22px;
    background: rgb(255 255 255 / 0.1);
    border: 1px solid rgb(255 255 255 / 0.18);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    box-shadow: 0 18px 44px rgb(0 0 0 / 0.42);
    max-width: 100%;
  }

  .pv-thumbs {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    min-width: 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .pv-thumbs::-webkit-scrollbar {
    display: none;
  }

  .pv-thumb {
    flex: none;
    width: 54px;
    height: 54px;
    border-radius: 13px;
    padding: 5px;
    cursor: pointer;
    background: #fff;
    border: 1px solid rgb(255 255 255 / 0.25);
    opacity: 0.62;
    display: grid;
    place-items: center;
    transition: opacity 0.15s ease;
  }

  .pv-thumb--active {
    border: 2px solid #fff;
    opacity: 1;
    box-shadow: 0 6px 16px rgb(0 0 0 / 0.35);
  }

  .pv-thumb-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .pv-divider {
    flex: none;
    width: 1px;
    height: 34px;
    background: rgb(255 255 255 / 0.2);
  }

  .pv-zoom {
    flex: none;
    width: 46px;
    height: 46px;
    border-radius: 14px;
    border: 1px solid rgb(255 255 255 / 0.22);
    background: rgb(255 255 255 / 0.14);
    color: #fff;
    cursor: pointer;
    display: grid;
    place-content: center;
    transition: background 0.15s ease;
  }

  .pv-zoom:hover {
    background: rgb(255 255 255 / 0.26);
  }

  /* Порог 860px — из макета (там он считался по window.innerWidth) */
  @media (width >= 53.75rem) {
    .pv-slot {
      padding: 26px 76px;
    }

    .pv-card {
      padding: 26px;
    }

    .pv-arrow {
      display: grid;
    }
  }

  @keyframes pv-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes pv-pop {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pv-root,
    .pv-card {
      animation: none;
    }
  }
}
</style>
