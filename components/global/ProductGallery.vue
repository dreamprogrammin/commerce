<script setup lang="ts">
import type { ProductImageRow } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useSeoAltText } from '@/composables/useSeoAltText'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const props = defineProps<{
  images: ProductImageRow[]
  productName?: string
  brandName?: string
  lineName?: string
  discountPercentage?: number | null
}>()

const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const { generateProductImageAlt } = useSeoAltText()

// --- Основная лента: scroll-snap вместо Embla ---------------------------------
// Единая механика с ProductCard.vue: нативный свайп на тач-устройствах,
// драг мышью на десктопе. Точки и вертикальный рельс миниатюр ведомы
// одним и тем же activeIndex.
const sliderRef = ref<HTMLElement | null>(null)
const railRef = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const hasMultipleImages = computed(() => props.images.length > 1)

/*
 * Окно предзагрузки. Реальный src получают только текущий кадр и соседи.
 *
 * До этого src стоял у всех кадров сразу, и нативный lazy их не сдерживал:
 * замер на проде 7 сентября (iPhone-профиль 390×844, DPR 3, товар с 14 фото)
 * — браузер тянул ШЕСТЬ кадров в варианте _lg, ~250 КБ, при том что виден
 * один. Порог `loading="lazy"` считается от вьюпорта, а кадры лежат в
 * горизонтальной ленте и попадают в него пачкой.
 *
 * Роботам это ничего не прячет: полный список URL всех фото уезжает в
 * JSON-LD (`Product.image` собирается в pages/catalog/products/[slug].vue
 * по всем product_images), а не вычитывается из разметки галереи.
 */
const PRELOAD_RADIUS = 1

function isNearActive(index: number) {
  return Math.abs(index - activeIndex.value) <= PRELOAD_RADIUS
}

/*
 * Пока едет наша собственная прокрутка, обработчик scroll молчит.
 *
 * У плавной прокрутки промежуточные значения scrollLeft — это чужие кадры, и
 * `Math.round` честно считал по ним индекс, затирая только что выставленный.
 * Трассировка возврата из лайтбокса на кадр 3 (десктоп): dot=2 → sl=46 dot=0
 * → sl=640 dot=1. Каждое такое изменение перерисовывает ленту, а mandatory
 * -привязка на перерисовке доводит до ближайшего кадра — прокрутка вставала
 * на 848 вместо 1696.
 *
 * При клике по миниатюре итог случайно сходился (последнее событие приходило
 * уже на цели), но по дороге рельс миниатюр дёргался через все промежуточные.
 */
let programmaticScrollUntil = 0

function scrollToIndex(index: number, smooth = true) {
  const el = sliderRef.value
  if (!el)
    return
  programmaticScrollUntil = Date.now() + (smooth ? 800 : 120)
  el.scrollTo({ left: index * el.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
}

// Активную миниатюру подтягиваем в видимую часть рельса: на мобильных он
// прокручивается вбок, на десктопе вниз (14 фото — это 1148px при окне 560),
// и без этого после свайпа подсвеченная миниатюра остаётся за краем.
function revealActiveThumb() {
  const rail = railRef.value
  if (!rail)
    return
  const thumb = rail.children[activeIndex.value] as HTMLElement | undefined
  thumb?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
}

watch(activeIndex, () => nextTick(revealActiveThumb))

function onSliderScroll(event: Event) {
  if (Date.now() < programmaticScrollUntil)
    return
  const el = event.currentTarget as HTMLElement
  if (!el?.clientWidth)
    return
  const index = Math.round(el.scrollLeft / el.clientWidth)
  if (index !== activeIndex.value)
    activeIndex.value = index
}

function selectImage(index: number) {
  activeIndex.value = index
  scrollToIndex(index)
}

// Драг мышью. `didDrag` гасит клик, который иначе откроет лайтбокс
// сразу после протяжки (тот же приём, что в ProductCard.vue).
const didDrag = ref(false)
let dragStartX = 0
let dragStartLeft = 0
let isDragging = false
let snapRestoreTimer: ReturnType<typeof setTimeout> | null = null

/*
 * На время драга снап приходится выключать.
 *
 * `scroll-snap-type: x mandatory` действует и на программную прокрутку: браузер
 * доводит до ближайшей точки привязки сразу после КАЖДОЙ записи в scrollLeft.
 * А драг только так ленту и двигает (`el.scrollLeft = ...` в onMouseMove).
 * Итог был буквальный: замер на проде 7 сентября, десктоп 1440×900 — протяжка
 * на 606px (три четверти кадра), scrollLeft на всех двадцати шагах ноль,
 * активная точка не сдвинулась. Мышью галерея не листалась вообще, оставались
 * только миниатюры.
 *
 * Возвращаем снап не сразу: сначала должна доехать плавная прокрутка из
 * onMouseUp, иначе она обрывается привязкой на полпути.
 */
function setSnap(enabled: boolean) {
  const el = sliderRef.value
  if (el)
    el.style.scrollSnapType = enabled ? '' : 'none'
}

/*
 * Драг слушаем мышиными событиями, а не pointer-. Это вторая половина той же
 * поломки.
 *
 * На pointer-событиях сценарий был такой: setPointerCapture на ленте, первый
 * pointermove честно двигал scrollLeft — и ровно на этом Chrome отменял
 * указатель. В логе видно `pointercancel` сразу за первым сдвигом: браузер
 * считает, что раз контейнер прокрутился, гестурой распоряжается он.
 * Обработчик pointercancel (это тот же onPointerUp) доводил ленту до
 * ближайшего кадра — то есть обратно на нулевой, — и на этом всё кончалось.
 * Мышиные события такому отзыву не подлежат.
 *
 * Заодно исчезает и причина первой поломки: без setPointerCapture click
 * больше не перенацеливается на ленту.
 */
function onMouseDown(event: MouseEvent) {
  if (event.button !== 0)
    return
  const el = sliderRef.value
  if (!el)
    return
  isDragging = true
  didDrag.value = false
  dragStartX = event.clientX
  dragStartLeft = el.scrollLeft
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}

function onMouseMove(event: MouseEvent) {
  const el = sliderRef.value
  if (!isDragging || !el)
    return
  const dx = event.clientX - dragStartX
  // До порога это ещё не драг, а обычное нажатие: снап не трогаем, иначе
  // тап на телефоне (браузер досылает совместимые mouse-события) на
  // полсекунды оставлял бы ленту без привязки.
  if (Math.abs(dx) <= 5)
    return
  if (!didDrag.value) {
    didDrag.value = true
    if (snapRestoreTimer)
      clearTimeout(snapRestoreTimer)
    setSnap(false)
  }
  el.scrollLeft = dragStartLeft - dx
}

function stopDragListeners() {
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}

function onMouseUp() {
  if (!isDragging)
    return
  isDragging = false
  stopDragListeners()
  const el = sliderRef.value
  if (!el || !didDrag.value)
    return
  const width = el.clientWidth || 1
  const maxIndex = Math.max(props.images.length - 1, 0)
  const index = Math.max(0, Math.min(Math.round(el.scrollLeft / width), maxIndex))
  activeIndex.value = index
  scrollToIndex(index)
  snapRestoreTimer = setTimeout(() => {
    if (!isDragging)
      setSnap(true)
  }, 450)
}

onBeforeUnmount(() => {
  stopDragListeners()
  if (snapRestoreTimer)
    clearTimeout(snapRestoreTimer)
})

// Сброс на первый кадр при смене товара (цветовые варианты — отдельные URL,
// но Nuxt переиспользует компонент страницы).
watch(() => props.images, () => {
  activeIndex.value = 0
  nextTick(() => scrollToIndex(0, false))
})

// --- Лайтбокс -----------------------------------------------------------------
// Само окно просмотра — PhotoViewer.vue (макет PhotoViewer.dc.html). Здесь
// остаётся только то, что связывает его с лентой: открыть и вернуться на тот
// кадр, на котором закрыли.
const isLightboxOpen = ref(false)

function openLightbox() {
  if (didDrag.value)
    return
  isLightboxOpen.value = true
}

// Клавиатура: до этого кадр был голым <div> с @click — открыть фото без мыши
// было нельзя вообще. Стрелки заодно листают ленту.
function onSliderKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    openLightbox()
    return
  }
  const maxIndex = Math.max(props.images.length - 1, 0)
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    selectImage(Math.min(activeIndex.value + 1, maxIndex))
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    selectImage(Math.max(activeIndex.value - 1, 0))
  }
}

/*
 * Возврат из просмотра на тот кадр, на котором его закрыли. Раньше лента
 * оставалась на исходном: пролистал до 3-го фото, закрыл — под ним по-прежнему
 * первое (проверено на проде 7 сентября).
 *
 * Прыжком, без плавности: окно в этот момент ещё разбирается, и снятие
 * блокировки прокрутки меняет раскладку — начатую плавную прокрутку привязка
 * кадров обрывала на полпути (вставала на 848 вместо 1696). Мгновенная
 * попадает точно в точку привязки, и пересчёт её не двигает.
 */
function onViewerIndex(next: number) {
  if (next === activeIndex.value)
    return
  activeIndex.value = next
  nextTick(() => scrollToIndex(next, false))
}

// Кадры для просмотра: полный размер плюс средний вариант, чтобы на узком
// экране не тянуть полуторатысячный файл.
const lightboxSlides = computed(() =>
  props.images.map((image, index) => {
    const { md, lg } = getImageVariants(image.image_url)
    const parts: string[] = []
    if (md)
      parts.push(`${md} 800w`)
    if (lg)
      parts.push(`${lg} 1440w`)
    return {
      src: getFullUrl(image.image_url) || '',
      srcset: parts.length ? parts.join(', ') : null,
      sizes: '92vw',
      alt: getImageAlt(image, index),
      // тот же файл, что и в рельсе миниатюр, — берётся из кеша браузера
      thumb: getThumbUrl(image.image_url),
    }
  }),
)

// --- URL и alt ----------------------------------------------------------------
function getThumbUrl(imagePath: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'sm')
    || getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_THUMB)
}

function getMainUrl(imagePath: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'md')
    || getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.PRODUCT_GALLERY_MAIN)
}

function getFullUrl(imagePath: string) {
  return getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'lg')
    || getImageUrl(BUCKET_NAME_PRODUCT, imagePath, IMAGE_SIZES.LARGE)
}

function getImageVariants(imagePath: string) {
  return {
    sm: getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'sm'),
    md: getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'md'),
    lg: getVariantUrl(BUCKET_NAME_PRODUCT, imagePath, 'lg'),
  }
}

/**
 * Получить SEO-оптимизированный alt текст для изображения
 * Использует alt_text из БД, если есть, иначе генерирует на лету
 */
function getImageAlt(image: ProductImageRow, index: number): string {
  if (image.alt_text && !image.alt_text.includes('Изображение товара')) {
    return image.alt_text
  }

  if (props.productName) {
    return generateProductImageAlt({
      productName: props.productName,
      brandName: props.brandName,
      lineName: props.lineName,
      index,
      totalImages: props.images.length,
    })
  }

  return `Изображение товара ${index + 1}`
}
</script>

<template>
  <div class="pg-card">
    <!-- Рельс миниатюр: на мобильных — горизонтальный под кадром (column-reverse),
         на десктопе — вертикальный слева -->
    <div v-if="hasMultipleImages" ref="railRef" class="pg-rail">
      <button
        v-for="(image, index) in images"
        :key="image.id"
        type="button"
        class="pg-thumb"
        :class="{ 'pg-thumb--active': index === activeIndex }"
        :aria-label="`Показать изображение ${index + 1}`"
        :aria-current="index === activeIndex"
        @click="selectImage(index)"
      >
        <ProgressiveImage
          :src="getThumbUrl(image.image_url)"
          :blur-data-url="image.blur_placeholder"
          :alt="getImageAlt(image, index)"
          object-fit="contain"
          :placeholder-type="image.blur_placeholder ? 'lqip' : 'shimmer'"
          class="size-full !bg-transparent"
        />
      </button>
    </div>

    <!-- Основной кадр -->
    <div class="pg-stage">
      <span v-if="discountPercentage" class="pg-discount">−{{ discountPercentage }}%</span>

      <!--
        Клик слушает лента, а не кадр, и это не стилистика.

        Прежний onPointerDown вешал setPointerCapture на саму ленту, а после
        захвата браузер отдаёт click ближайшему общему предку захватившего
        элемента и цели — то есть .pg-slider. Обработчик стоял на .pg-slide,
        потомке, и до него событие не доходило никогда: на проде 7 сентября
        клик мышью по фото не открывал лайтбокс ни на десктопе, ни в мобильной
        эмуляции; тапом работало, потому что для touch захват не ставился.
        Захвата больше нет — драг переехал на mouse-события, — но обработчик
        оставлен на ленте: одного на всю ленту достаточно, и он не зависит от
        того, во что именно попал курсор внутри неё.
      -->
      <!-- `!bg-transparent` у кадров и миниатюр: по макету фото лежит на чистом
           белом, а серая подложка `bg-muted` из ProgressiveImage при
           object-fit: contain вылезала полями по бокам. Перебить её из
           scoped-стиля нельзя — утилиты Tailwind всегда бьют @layer components
           (см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md), поэтому важность.
           Размытая подложка LQIP лежит отдельным слоем и остаётся на месте. -->
      <div
        ref="sliderRef"
        class="pg-slider"
        tabindex="0"
        :aria-label="`Фото товара, ${activeIndex + 1} из ${images.length}. Enter — открыть во весь экран`"
        @scroll.passive="onSliderScroll"
        @mousedown="onMouseDown"
        @dragstart.prevent
        @click="openLightbox"
        @keydown="onSliderKeydown"
      >
        <div
          v-for="(image, index) in images"
          :key="image.id"
          class="pg-slide"
        >
          <ProgressiveImage
            :src="isNearActive(index) ? getMainUrl(image.image_url) : null"
            :src-sm="isNearActive(index) ? getImageVariants(image.image_url).sm : null"
            :src-md="isNearActive(index) ? getImageVariants(image.image_url).md : null"
            :src-lg="isNearActive(index) ? getImageVariants(image.image_url).lg : null"
            sizes="(max-width: 1024px) calc(100vw - 100px), (max-width: 1536px) 52vw, 740px"
            :blur-data-url="image.blur_placeholder"
            :alt="getImageAlt(image, index)"
            object-fit="contain"
            :placeholder-type="image.blur_placeholder ? 'lqip' : 'shimmer'"
            :eager="index === 0"
            :fetchpriority="index === 0 ? 'high' : 'auto'"
            class="size-full !bg-transparent"
          />
        </div>
      </div>

      <!-- «Увеличить» — из макета Товар.dc.html. До неё открыть фото можно было
           только кликом по самому кадру, и об этом никто не догадывался. -->
      <button type="button" class="pg-zoom-cta" @click.stop="openLightbox">
        <Icon name="lucide:zoom-in" class="size-[18px]" />
        Увеличить
      </button>

      <div v-if="hasMultipleImages" class="pg-dots">
        <span
          v-for="(image, index) in images"
          :key="image.id"
          class="pg-dot"
          :class="{ 'pg-dot--active': index === activeIndex }"
        />
      </div>
    </div>

    <!-- Просмотр фото во весь экран — макет PhotoViewer.dc.html -->
    <PhotoViewer
      v-model:open="isLightboxOpen"
      :images="lightboxSlides"
      :start-index="activeIndex"
      :title="productName"
      @update:index="onViewerIndex"
    />
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
  .pg-card {
    display: flex;
    flex-direction: column-reverse;
    gap: 14px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 14px;
    box-shadow: var(--elevation-card);
  }

  .pg-rail {
    display: flex;
    flex-direction: row;
    gap: 10px;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  .pg-rail::-webkit-scrollbar {
    display: none;
  }

  .pg-thumb {
    flex: none;
    width: 60px;
    height: 60px;
    border-radius: 14px;
    padding: 7px;
    cursor: pointer;
    background: var(--card);
    border: 1px solid var(--border);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
    display: grid;
    place-items: center;
    transition:
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .pg-thumb--active {
    border: 2px solid var(--primary);
    box-shadow: 0 4px 12px rgb(43 127 255 / 0.22);
  }

  .pg-stage {
    position: relative;
    flex: 1;
    min-width: 0;
    aspect-ratio: 1;
    border-radius: 22px;
    overflow: hidden;
    background: var(--card);
    border: 1px solid rgba(255, 255, 255, 0.8);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.9),
      inset 0 -18px 40px rgba(15, 23, 42, 0.05);
  }

  .pg-discount {
    position: absolute;
    top: 16px;
    left: 16px;
    z-index: 2;
    /* Плашка лежит рядом с лентой, а не внутри кадра, поэтому клик по ней
       никуда не всплывал — верхний левый угол фото был мёртвой зоной
       примерно 62×32 (нашлось тем, что по нему не удавалось открыть
       лайтбокс). Точкам ниже pointer-events уже отключён по той же причине. */
    pointer-events: none;
    padding: 6px 13px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    box-shadow: 0 6px 16px rgb(220 38 38 / 0.32);
  }

  .pg-slider {
    display: flex;
    width: 100%;
    height: 100%;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    overscroll-behavior-x: contain;
    /* zoom-in, а не grab: по макету кадр в первую очередь открывается на весь
       экран, а протяжка — вторичный жест. На время протяжки курсор меняем. */
    cursor: zoom-in;
    /* Драг мышью больше не гасит mousedown через preventDefault (иначе лента
       не получала бы фокус), поэтому выделение снимаем стилем. */
    user-select: none;
    scrollbar-width: none;
    -ms-overflow-style: none;
    /* pan-x обязателен: без него браузер отдаёт тач только вертикали, и
       свайп по кадру не листает галерею — на тач-устройствах ленту двигает
       нативный скролл, свои обработчики там не участвуют (они мышиные).
       pan-y остаётся, иначе кадр во весь экран запирает прокрутку страницы. */
    touch-action: pan-x pan-y pinch-zoom;
  }

  .pg-slider::-webkit-scrollbar {
    display: none;
  }

  .pg-slider:active {
    cursor: grabbing;
  }

  /* Лента стала фокусируемой (Enter открывает лайтбокс, стрелки листают) —
     кольцо рисуем внутрь, снаружи его срезал бы overflow: hidden у .pg-stage. */
  .pg-slider:focus {
    outline: none;
  }

  .pg-slider:focus-visible {
    outline: 2px solid var(--primary);
    outline-offset: -4px;
    border-radius: 18px;
  }

  .pg-slide {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    padding: 18px;
    cursor: zoom-in;
  }

  /* Тень под товаром из макета (drop-shadow 0 22px 30px) сюда не переносится и
     намеренно не сделана. drop-shadow идёт по альфе картинки: в макете это
     PNG-вырезка танка, и тень обводит силуэт. В каталоге же фотографии
     прямоугольные — сверено по двум товарам, у одного альфы нет вовсе, у
     второго она есть, но фон всё равно залит. На таких снимках тень рисует
     серый прямоугольник вокруг фото, и кадр выглядит наклеенной карточкой.
     Вернуть можно, когда съёмка перейдёт на вырезки с прозрачным фоном. */

  .pg-zoom-cta {
    position: absolute;
    right: 14px;
    bottom: 14px;
    z-index: 3;
    display: none;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.96), rgba(224, 233, 247, 0.7));
    -webkit-backdrop-filter: blur(10px) saturate(1.6);
    backdrop-filter: blur(10px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 #fff,
      0 5px 14px rgba(15, 23, 42, 0.12);
    font-size: 13.5px;
    font-weight: 700;
    color: var(--primary);
    cursor: pointer;
    transition: box-shadow 0.18s ease;
  }

  .pg-zoom-cta:hover {
    box-shadow:
      inset 0 1px 0 #fff,
      0 8px 20px rgba(43, 127, 255, 0.26);
  }

  .pg-dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 13px;
    display: flex;
    justify-content: center;
    gap: 6px;
    pointer-events: none;
    z-index: 2;
  }

  .pg-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: var(--rating-empty);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.18);
    transition:
      width 0.22s ease,
      background 0.22s ease;
  }

  .pg-dot--active {
    width: 20px;
    background: var(--primary);
  }

  @media (width >= 64rem) {
    .pg-card {
      flex-direction: row;
      padding: 18px;
    }

    .pg-rail {
      flex-direction: column;
      overflow-x: visible;
      overflow-y: auto;
      max-height: 560px;
    }

    .pg-thumb {
      width: 72px;
      height: 72px;
    }

    .pg-slide {
      padding: 34px;
    }

    /* Только на широком кадре: на телефоне пилюля с подписью наезжает на
       ряд точек (у товара их бывает четырнадцать), а тап по фото там и так
       привычный жест. */
    .pg-zoom-cta {
      display: inline-flex;
    }
  }
}
</style>
