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
 *  • кадр рисуется <img> с alt, а не фоном у <span>: фон не даёт ни
 *    альтернативного текста, ни ленивой загрузки;
 *  • дальние кадры грузятся лениво (у прототипа все сразу);
 *  • раскладка «мобильный/десктоп» сделана медиазапросами, а не замером
 *    window.innerWidth на resize — она верна ещё до гидратации;
 *  • добавлены role="dialog", возврат фокуса и подпись — прототипу это не
 *    нужно, живому модальному окну обязательно.
 */

export interface PhotoViewerImage {
  /** Облегчённый файл: с него кадр показывается сразу. */
  src: string
  /**
   * Полноразмерный файл. Грузится ТОЛЬКО для того кадра, который сейчас
   * смотрят, — и подменяется, когда доедет. Так деталь видна там, где её
   * разглядывают, а за остальные тринадцать фото платить не приходится.
   */
  full?: string | null
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
const MAX_ZOOM = 4
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
/*
 * Увеличение описывается сдвигом и масштабом (`translate` + `scale`), а не
 * `transform-origin`, как было раньше. Через origin нельзя выразить щипок:
 * при нём точка между пальцами обязана оставаться на месте, а origin задаётся
 * до масштабирования и на ходу пересчитывается неоднозначно. Со сдвигом
 * формула прямая — см. zoomAt().
 */
const panX = ref(0)
const panY = ref(0)
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
    : 'Свайп · щипок — увеличить · вниз — закрыть',
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
  const active = i === index.value
  const scale = active ? zoom.value : 1
  const x = active ? panX.value : 0
  const y = active ? panY.value : 0
  return {
    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
    transition: isDragging.value ? 'none' : 'transform .22s ease',
  }
}

/*
 * Полный размер — только тому кадру, который смотрят.
 *
 * Кадр показывается с облегчённого файла, а полноразмерный догружается в
 * стороне и подменяется по `onload`. Подменять напрямую нельзя: смена `src` у
 * уже нарисованной картинки роняет `naturalWidth` в ноль, и на месте фото до
 * конца загрузки пустота — проверено, когда так же пробовал менять `sizes`.
 * Через предзагрузку файл к моменту подмены уже в кеше, и она мгновенная.
 *
 * Множество, а не один индекс: пролистал вперёд-назад — возвращаться к
 * облегчённому варианту незачем, файл уже скачан.
 */
const hiRes = ref(new Set<number>())

function srcFor(i: number) {
  const slide = slides.value[i]
  if (!slide)
    return undefined
  // дальним кадрам не даём ничего: у товара их бывает полтора десятка, и
  // тянуть все разом при открытии незачем
  if (!isNear(i))
    return undefined
  return hiRes.value.has(i) ? (slide.full || slide.src) : slide.src
}

function ensureHiRes(i: number) {
  const slide = slides.value[i]
  if (!slide?.full || slide.full === slide.src || hiRes.value.has(i))
    return
  const pre = new Image()
  pre.onload = () => {
    const next = new Set(hiRes.value)
    next.add(i)
    hiRes.value = next
  }
  pre.src = slide.full
}

// Соседние кадры грузим сразу, дальние — лениво.
function isNear(i: number) {
  return Math.abs(i - index.value) <= 1
}

/*
 * Полный размер заказываем не на каждом пролистывании, а когда на кадре
 * задержались.
 *
 * Без паузы «пробежаться по фото в поисках нужного» стоило столько же, сколько
 * вдумчивый просмотр: замер — восемь листаний с паузой 120мс дают восемь
 * полноразмерных файлов, ровно как восемь листаний с паузой 1.5с. Причём
 * лишние закачки отнимают канал у того кадра, на котором в итоге остановились:
 * на 3G после рывка через шесть кадров нужный снимок доходил до полного
 * размера 953мс, тогда как при спокойном листании он был готов заранее.
 *
 * При открытии ждать нечего — просмотр открыли ради конкретного фото.
 */
const HIRES_SETTLE_MS = 300
let hiResTimer: ReturnType<typeof setTimeout> | null = null

function scheduleHiRes(i: number) {
  if (hiResTimer)
    clearTimeout(hiResTimer)
  hiResTimer = setTimeout(() => ensureHiRes(i), HIRES_SETTLE_MS)
}

watch(index, i => scheduleHiRes(i))

// Сменился товар — индексы теперь про другие фотографии, отметки о скачанном
// сбрасываем, иначе чужой кадр показался бы «уже полноразмерным».
watch(slides, () => {
  hiRes.value = new Set()
})

function altFor(image: PhotoViewerImage, i: number) {
  return image.alt || `${props.title || 'Фото'} — изображение ${i + 1}`
}

function resetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  dragX.value = 0
  dragY.value = 0
}

// --- увеличение ---------------------------------------------------------------
const stageRef = ref<HTMLElement | null>(null)

function activeImage(): HTMLImageElement | null {
  return stageRef.value?.querySelectorAll<HTMLImageElement>('.pv-img')[index.value] ?? null
}

/**
 * На сколько кадр можно увести в сторону, чтобы фотография не отошла от края
 * окна. Считаем по реально нарисованной картинке: у `object-fit: contain` она
 * почти всегда меньше своего блока, и по габаритам блока запас вышел бы
 * завышенным — картинку можно было бы утащить в пустое поле.
 */
function panLimits(atZoom = zoom.value) {
  const img = activeImage()
  if (!img)
    return { x: 0, y: 0 }
  const boxW = img.offsetWidth
  const boxH = img.offsetHeight
  const nw = img.naturalWidth
  const nh = img.naturalHeight
  const fit = nw && nh ? Math.min(boxW / nw, boxH / nh) : 1
  const drawnW = nw ? nw * fit : boxW
  const drawnH = nh ? nh * fit : boxH
  return {
    x: Math.max(0, (drawnW * atZoom - boxW) / 2),
    y: Math.max(0, (drawnH * atZoom - boxH) / 2),
  }
}

function clampPan() {
  const lim = panLimits()
  panX.value = Math.max(-lim.x, Math.min(panX.value, lim.x))
  panY.value = Math.max(-lim.y, Math.min(panY.value, lim.y))
}

/**
 * Увеличить до `next`, оставив точку (clientX, clientY) на месте.
 *
 * Масштаб идёт от центра блока, поэтому центр после преобразования — это
 * центр блока плюс текущий сдвиг; отсюда и берём исходную точку отсчёта.
 * Дальше обычная замена масштаба вокруг фокуса:
 *     pan' = f − (f − pan) · z' / z
 */
function zoomAt(next: number, clientX: number, clientY: number) {
  const img = activeImage()
  const from = zoom.value
  const to = Math.max(1, Math.min(next, MAX_ZOOM))
  if (!img || from === to) {
    zoom.value = to
    if (to === 1) {
      panX.value = 0
      panY.value = 0
    }
    return
  }
  const rect = img.getBoundingClientRect()
  const centreX = rect.left + rect.width / 2 - panX.value
  const centreY = rect.top + rect.height / 2 - panY.value
  const fx = clientX - centreX
  const fy = clientY - centreY
  const k = to / from
  zoom.value = to
  if (to === 1) {
    panX.value = 0
    panY.value = 0
    return
  }
  panX.value = fx - (fx - panX.value) * k
  panY.value = fy - (fy - panY.value) * k
  clampPan()
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
/*
 * Одним указателем работают прежние жесты: свайп в сторону листает, свайп вниз
 * закрывает. Как только на кадре оказывается второй палец, включается щипок —
 * и тогда свайп отменяется, иначе лента уезжала бы вбок под сведение пальцев.
 * В увеличенном кадре один палец не листает, а возит картинку.
 */
const pointers = new Map<number, { x: number, y: number }>()
type Gesture = 'swipe' | 'pan' | 'pinch' | null
let gesture: Gesture = null
let axis: 'x' | 'y' | null = null
let moved = false
let startX = 0
let startY = 0
let panStartX = 0
let panStartY = 0
let panFromX = 0
let panFromY = 0
let pinchStartDist = 0
let pinchStartZoom = 1

function pointerList() {
  return [...pointers.values()]
}

function pinchDistance() {
  const [a, b] = pointerList()
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pinchCentre() {
  const [a, b] = pointerList()
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

function beginPan(x: number, y: number) {
  gesture = 'pan'
  panStartX = x
  panStartY = y
  panFromX = panX.value
  panFromY = panY.value
}

function beginPinch() {
  gesture = 'pinch'
  moved = true
  isDragging.value = true
  // начатый свайп отменяем: под щипком лента не должна ехать
  dragX.value = 0
  dragY.value = 0
  axis = null
  pinchStartDist = pinchDistance() || 1
  pinchStartZoom = zoom.value
}

/*
 * Щипок и возка пальцем — только для касаний.
 *
 * Просили именно мобильный жест, и на десктопе увеличенный кадр обязан вести
 * себя как раньше: наведение мыши водит по картинке, а зажатая кнопка не
 * делает ничего. Без этой проверки мышь в увеличенном кадре начинала возить
 * картинку, и на отпускании наведение тут же дёргало её обратно к курсору —
 * два механизма спорили за один и тот же сдвиг.
 *
 * Заодно щипок не соберётся из мыши и пера: на гибридном ноутбуке второй
 * указатель мог бы прилететь откуда угодно.
 */
function isTouch(event: PointerEvent) {
  return event.pointerType === 'touch'
}

function onPointerDown(event: PointerEvent) {
  if (!isTouch(event)) {
    // мышь и перо: в увеличенном кадре ничего не начинаем, как было до щипка
    if (isZoomed.value)
      return
    moved = false
    isDragging.value = true
    gesture = 'swipe'
    axis = null
    startX = event.clientX
    startY = event.clientY
    return
  }

  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  try {
    if (event.pointerId != null)
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }
  catch {}

  if (pointers.size >= 2) {
    beginPinch()
    return
  }

  moved = false
  isDragging.value = true
  if (isZoomed.value) {
    beginPan(event.clientX, event.clientY)
    return
  }
  gesture = 'swipe'
  axis = null
  startX = event.clientX
  startY = event.clientY
}

function onPointerMove(event: PointerEvent) {
  if (isTouch(event) && pointers.has(event.pointerId))
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })

  if (gesture === 'pinch' && pointers.size >= 2) {
    const centre = pinchCentre()
    zoomAt((pinchDistance() / pinchStartDist) * pinchStartZoom, centre.x, centre.y)
    return
  }

  if (gesture === 'pan') {
    panX.value = panFromX + (event.clientX - panStartX)
    panY.value = panFromY + (event.clientY - panStartY)
    clampPan()
    if (Math.abs(event.clientX - panStartX) > AXIS_LOCK_PX
      || Math.abs(event.clientY - panStartY) > AXIS_LOCK_PX) {
      moved = true
    }
    return
  }

  // Мышь в увеличенном кадре не тащит, а водит: наведение показывает нужный
  // угол фотографии. Кнопка при этом не нажата, своего указателя в списке нет.
  if (!pointers.has(event.pointerId) && isZoomed.value && event.pointerType !== 'touch') {
    const img = activeImage()
    if (!img)
      return
    const rect = img.getBoundingClientRect()
    if (!rect.width || !rect.height)
      return
    const u = (event.clientX - (rect.left + panX.value)) / rect.width
    const v = (event.clientY - (rect.top + panY.value)) / rect.height
    panX.value = (u - 0.5) * img.offsetWidth * (1 - zoom.value)
    panY.value = (v - 0.5) * img.offsetHeight * (1 - zoom.value)
    clampPan()
    return
  }

  if (gesture !== 'swipe')
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

function onPointerUp(event: PointerEvent) {
  if (isTouch(event))
    pointers.delete(event.pointerId)

  if (gesture === 'pinch') {
    if (pointers.size === 1) {
      // один палец остался — дальше он возит картинку, а не начинает свайп
      const [rest] = pointerList()
      beginPan(rest.x, rest.y)
      return
    }
    if (pointers.size === 0) {
      gesture = null
      isDragging.value = false
      // почти единица — считаем, что хотели вернуть исходный размер
      if (zoom.value <= 1.05)
        resetView()
      else
        clampPan()
    }
    return
  }

  if (gesture === 'pan') {
    if (pointers.size === 0) {
      gesture = null
      isDragging.value = false
      clampPan()
    }
    return
  }

  if (gesture !== 'swipe')
    return
  gesture = null

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
  // Клик после протяжки или щипка — не клик.
  if (moved) {
    moved = false
    return
  }
  if (isZoomed.value) {
    resetView()
    return
  }
  zoomAt(zoomFactor.value, event.clientX, event.clientY)
}

function toggleZoom() {
  if (isZoomed.value) {
    resetView()
    return
  }
  zoom.value = zoomFactor.value
  panX.value = 0
  panY.value = 0
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
    ensureHiRes(index.value)
    resetView()
    // указатели могли остаться от прошлого открытия, если палец подняли уже
    // за пределами окна
    pointers.clear()
    gesture = null
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
    if (hiResTimer)
      clearTimeout(hiResTimer)
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
  if (hiResTimer)
    clearTimeout(hiResTimer)
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
          ref="stageRef"
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
                  :src="srcFor(i)"
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
