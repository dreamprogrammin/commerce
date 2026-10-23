<script setup lang="ts">
import type { Database } from '@/types'
import type { MosaicProduct, MosaicSeason } from '@/utils/discountMosaic'
import { useEventListener } from '@vueuse/core'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import {
  discountPercentOf,
  maxDiscountOf,
  MOSAIC_POOL_SIZE,
  mosaicSequence,
  mosaicTitle,
  pickMosaic,
  seasonOf,
} from '@/utils/discountMosaic'
import { formatPrice, formatTenge } from '@/utils/formatPrice'

/**
 * «Скидки — мозаика» на главной (макет `DiscountMosaic.dc.html`, проект
 * «Прототип для покупателей» в claude.ai/design).
 *
 * Красная карточка с лентой в две строки: крупная плитка 2×2 и мелкие по
 * две в колонку. Какие товары и в каком порядке — `utils/discountMosaic.ts`,
 * там же правило выбора крупных плиток.
 *
 * Отличия от макета, все в сторону боевого магазина:
 * - «мобильный/десктоп» — медиазапросом на 640px, а не замером ширины в JS:
 *   секция рисуется на сервере, и замер дал бы расхождение гидратации;
 * - кадр — `<img>` с alt вместо фона у `<span>`, вариант по размеру плитки
 *   (в макете один файл на всё), и вставляется он только у плиток рядом с
 *   экраном — почему, см. «Кадры» ниже;
 * - бонусы — `bonus_points_award` товара, а не 5% от цены; нет бонусов — нет
 *   плашки;
 * - сезон в заголовке считается по дате (в макете «Осенние» навсегда).
 */

/** Только то, что рисует плитка: payload главной пишется в кеш ISR. */
interface MosaicTileData {
  slug: string
  name: string
  price: number
  final_price: number | null
  discount_percentage: number
  bonus_points_award: number
  image_url: string | null
  big: boolean
}

interface MosaicData {
  season: MosaicSeason
  tiles: MosaicTileData[]
}

const supabase = useSupabaseClient<Database>()
const { getVariantUrl } = useSupabaseStorage()

/*
 * На сервере и без `lazy` — по той же причине, что у «Популярных брендов» и
 * «Товара дня»: с `lazy` разметка уехала бы пустой, а payload досериализовался
 * бы уже с данными (расхождение гидратации). Сезон считается здесь же и едет
 * в payload: страница живёт в кеше, и дата браузера на стыке сезонов дала бы
 * другой заголовок, чем в разметке.
 */
const { data: mosaic } = await useAsyncData<MosaicData | null>(
  'home-discount-mosaic',
  async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, slug, name, price, final_price, discount_percentage, bonus_points_award, brand_id, product_images(image_url, display_order)')
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .gt('discount_percentage', 0)
      // Порядок обязан быть полным: при равных значениях без `id` база вправе
      // отдать строки в любом порядке, HTML менялся бы от пересборки к
      // пересборке, и каждая такая пересборка — платная запись ISR.
      .order('discount_percentage', { ascending: false })
      .order('price', { ascending: false })
      .order('id', { ascending: true })
      .order('display_order', { referencedTable: 'product_images', ascending: true })
      .order('image_url', { referencedTable: 'product_images', ascending: true })
      .limit(1, { referencedTable: 'product_images' })
      .limit(MOSAIC_POOL_SIZE)

    if (error) {
      console.error('❌ Не удалось загрузить скидки для главной:', error)
      return null
    }

    const pool: MosaicProduct[] = (data ?? []).map(row => ({
      id: row.id,
      slug: row.slug,
      name: row.name,
      price: Number(row.price),
      final_price: row.final_price == null ? null : Number(row.final_price),
      discount_percentage: Number(row.discount_percentage),
      bonus_points_award: row.bonus_points_award ?? 0,
      brand_id: row.brand_id,
      image_url: row.product_images?.[0]?.image_url ?? null,
    }))

    const { big, small } = pickMosaic(pool)
    const tiles = mosaicSequence(big, small).map(t => ({
      slug: t.slug,
      name: t.name,
      price: t.price,
      final_price: t.final_price,
      discount_percentage: t.discount_percentage,
      bonus_points_award: t.bonus_points_award,
      image_url: t.image_url,
      big: t.big,
    }))

    return tiles.length ? { season: seasonOf(new Date()), tiles } : null
  },
  { default: () => null },
)

const title = computed(() =>
  mosaic.value ? mosaicTitle(mosaic.value.season, maxDiscountOf(mosaic.value.tiles)) : '',
)

/*
 * Кадр мелкой плитки — 108px (на телефоне 80): даже при DPR 3 это 324
 * точки, и вариант `sm` (400px) покрывает его всегда. Поэтому у мелких
 * srcset нет вовсе — он был бы мёртвым весом, ~6 КБ разметки на 16 плиток.
 *
 * Крупной нужны все три ступеньки: кадр 228px (на телефоне 172) при DPR 2–3 —
 * это 344–684 точки. `sizes` — по фактическому кадру, а не по плитке:
 * объявишь больше — браузер возьмёт следующую ступеньку (правило из
 * ProductCard.vue).
 */
const SIZES_BIG = '(max-width: 639px) 172px, 228px'

function imageOf(path: string | null, big: boolean) {
  if (!path)
    return { src: null, srcset: undefined }
  const sm = getVariantUrl(BUCKET_NAME_PRODUCT, path, 'sm')
  // Старые фото с расширением живут одним файлом, вариантов у них нет.
  if (!big || /\.\w{3,4}$/.test(path))
    return { src: sm, srcset: undefined }
  const srcset = [
    `${sm} 400w`,
    `${getVariantUrl(BUCKET_NAME_PRODUCT, path, 'card')} 480w`,
    `${getVariantUrl(BUCKET_NAME_PRODUCT, path, 'md')} 800w`,
  ].join(', ')
  return { src: sm, srcset }
}

const tiles = computed(() =>
  (mosaic.value?.tiles ?? []).map((t) => {
    const finalPrice = t.final_price ?? t.price
    const percent = discountPercentOf(t)
    return {
      ...t,
      ...imageOf(t.image_url, t.big),
      percent,
      now: formatTenge(finalPrice),
      old: formatTenge(t.price),
      bonus: t.bonus_points_award > 0 ? formatPrice(t.bonus_points_award) : null,
      aria: `${t.name} — ${formatTenge(finalPrice)}, скидка ${percent}%`,
    }
  }),
)

// --- Лента: края, стрелки, протяжка мышью ---
const railRef = ref<HTMLElement | null>(null)
const atStart = ref(true)
const atEnd = ref(false)
const dragging = ref(false)

function syncEdges() {
  const el = railRef.value
  if (!el)
    return
  atStart.value = el.scrollLeft <= 6
  atEnd.value = el.scrollLeft >= el.scrollWidth - el.clientWidth - 6
}

let stepTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Шаг стрелкой — три четверти видимой ленты. Если плавная прокрутка не
 * сдвинула ленту (привязка к плиткам вернула её на место), доводим без
 * анимации — так же страхуется макет.
 */
function scrollStep(dir: 1 | -1) {
  const el = railRef.value
  if (!el)
    return
  const from = el.scrollLeft
  const max = el.scrollWidth - el.clientWidth
  const to = Math.max(0, Math.min(max, from + dir * Math.max(260, el.clientWidth * 0.75)))
  if (Math.abs(to - from) < 2)
    return
  el.scrollTo({ left: to, behavior: 'smooth' })
  if (stepTimer)
    clearTimeout(stepTimer)
  stepTimer = setTimeout(() => {
    stepTimer = null
    if (Math.abs(el.scrollLeft - from) < 2) {
      el.style.scrollSnapType = 'none'
      el.scrollLeft = to
      el.style.scrollSnapType = ''
    }
    syncEdges()
  }, 380)
}

/*
 * Протяжка мышью — на mouse-, а не pointer-событиях: у прокручиваемого
 * контейнера Chrome отбирает указатель (`pointercancel`) на первом же сдвиге,
 * и драг умирал после одного кадра (та же грабля разобрана в ProductGallery и
 * PhotoViewer). Палец листает ленту нативно. Привязку к плиткам на время
 * протяжки снимаем: она возвращала бы ленту после каждой записи scrollLeft.
 */
function onRailDown(e: MouseEvent) {
  const el = railRef.value
  if (!el || e.button !== 0)
    return
  const x0 = e.clientX
  const s0 = el.scrollLeft
  let moved = false

  const move = (ev: MouseEvent) => {
    const d = ev.clientX - x0
    if (!moved && Math.abs(d) > 4) {
      moved = true
      dragging.value = true
    }
    if (moved)
      el.scrollLeft = s0 - d
  }
  const up = () => {
    window.removeEventListener('mousemove', move)
    window.removeEventListener('mouseup', up)
    if (!moved)
      return
    dragging.value = false
    syncEdges()
    // Клик, которым кончилась протяжка, не должен открыть товар под курсором.
    const block = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    el.addEventListener('click', block, { capture: true, once: true })
    setTimeout(() => el.removeEventListener('click', block, { capture: true }), 0)
  }
  window.addEventListener('mousemove', move)
  window.addEventListener('mouseup', up)
}

// --- Кадры: только у плиток, до которых человек вот-вот доберётся ---
/*
 * Одного `loading="lazy"` здесь мало, проверено замером (390px, DPR 3,
 * Slow 4G, CPU ×4): 12 кадров ленты качались ДО DOMContentLoaded, рядом с 16
 * картинками всей остальной страницы. На медленной сети Chrome считает
 * «близко к экрану» всё в пределах ~2500px, а секция лежит ближе, причём
 * правило действует и вдоль ленты — за правым краем она тянула ещё полдюжины.
 *
 * Поэтому `<img>` вставляется сам, по двум условиям: секция подошла к экрану
 * ближе чем на 400px, а плитка — ближе чем на 200px к видимой части ленты.
 * На сервере кадров нет вовсе; текст плиток, цены и ссылки — есть.
 */
const sectionRef = ref<HTMLElement | null>(null)
const near = ref(false)
const seen = ref<boolean[]>([])

let sectionObserver: IntersectionObserver | null = null
let tileObserver: IntersectionObserver | null = null

function observeImages() {
  const section = sectionRef.value
  const rail = railRef.value
  if (!section || !rail)
    return
  if (!('IntersectionObserver' in window)) {
    near.value = true
    seen.value = tiles.value.map(() => true)
    return
  }
  sectionObserver = new IntersectionObserver((entries) => {
    if (!entries.some(e => e.isIntersecting))
      return
    near.value = true
    sectionObserver?.disconnect()
    sectionObserver = null
  }, { rootMargin: '400px 0px' })
  sectionObserver.observe(section)

  const index = new Map<Element, number>()
  tileObserver = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting)
        continue
      seen.value[index.get(e.target) ?? -1] = true
      tileObserver?.unobserve(e.target)
    }
  }, { root: rail, rootMargin: '0px 200px' })
  rail.querySelectorAll('.dm-tile').forEach((tile, i) => {
    index.set(tile, i)
    tileObserver?.observe(tile)
  })
}

onMounted(() => {
  syncEdges()
  observeImages()
})
// Главная удерживается в памяти: при возврате лента стоит там, где её оставили.
onActivated(syncEdges)
useEventListener('resize', syncEdges, { passive: true })
onBeforeUnmount(() => {
  if (stepTimer)
    clearTimeout(stepTimer)
  sectionObserver?.disconnect()
  tileObserver?.disconnect()
})
</script>

<template>
  <section v-if="mosaic && tiles.length" ref="sectionRef" class="dm-wrap" aria-labelledby="dm-title">
    <div class="dm-card">
      <span class="dm-glyph dm-glyph--a" aria-hidden="true">%</span>
      <span class="dm-glyph dm-glyph--b" aria-hidden="true">%</span>
      <span class="dm-glyph dm-glyph--c" aria-hidden="true">%</span>

      <div class="dm-head">
        <h2 id="dm-title" class="dm-title">
          {{ title }}
        </h2>
        <NuxtLink to="/catalog/promotions" class="dm-more">
          <span class="dm-more__long">Смотреть все</span>
          <span class="dm-more__short">Все</span>
          <Icon name="lucide:arrow-right" class="size-[17px]" />
        </NuxtLink>
      </div>

      <div class="dm-stage">
        <div
          ref="railRef"
          class="dm-rail"
          :class="{ 'dm-rail--dragging': dragging }"
          @scroll.passive="syncEdges"
          @mousedown="onRailDown"
        >
          <NuxtLink
            v-for="(tile, i) in tiles"
            :key="tile.slug"
            :to="`/catalog/products/${tile.slug}`"
            class="dm-tile"
            :class="{ 'dm-tile--big': tile.big }"
            :aria-label="tile.aria"
            draggable="false"
          >
            <span class="dm-media">
              <img
                v-if="tile.src && near && seen[i]"
                :src="tile.src"
                :srcset="tile.srcset"
                :sizes="tile.srcset ? SIZES_BIG : undefined"
                :alt="tile.name"
                class="dm-img"
                loading="lazy"
                decoding="async"
                draggable="false"
              >
              <span class="dm-badge">−{{ tile.percent }}%</span>
              <span v-if="!tile.big && tile.bonus" class="dm-bonus dm-bonus--pin">
                <Icon name="lucide:gift" class="size-3 shrink-0" />+{{ tile.bonus }}&nbsp;Б
              </span>
            </span>
            <span class="dm-body">
              <span v-if="tile.big" class="dm-name">{{ tile.name }}</span>
              <span class="dm-price">
                <span class="dm-price__now">{{ tile.now }}</span>
                <span class="dm-price__old">{{ tile.old }}</span>
              </span>
              <span v-if="tile.big && tile.bonus" class="dm-bonus">
                <Icon name="lucide:gift" class="size-3 shrink-0" />+{{ tile.bonus }} бонусов
              </span>
            </span>
          </NuxtLink>
        </div>

        <span class="dm-arrow dm-arrow--prev" :class="{ 'dm-arrow--off': atStart }">
          <button
            type="button"
            class="dm-arrow__btn"
            aria-label="Предыдущие товары"
            :tabindex="atStart ? -1 : undefined"
            @click="scrollStep(-1)"
          >
            <Icon name="lucide:chevron-left" class="size-[22px]" />
          </button>
        </span>
        <span class="dm-arrow dm-arrow--next" :class="{ 'dm-arrow--off': atEnd }">
          <button
            type="button"
            class="dm-arrow__btn"
            aria-label="Следующие товары"
            :tabindex="atEnd ? -1 : undefined"
            @click="scrollStep(1)"
          >
            <Icon name="lucide:chevron-right" class="size-[22px]" />
          </button>
        </span>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md

   Значения — из макета как есть. Мобильная раскладка — до 640px (в макете
   `w < 640`): карточка во всю ширину экрана, без скруглений. */

@layer components {
  .dm-wrap {
    padding-block: 16px;
  }

  .dm-card {
    --dm-col: 104px;
    --dm-row: 166px;
    --dm-pad: 12px;
    position: relative;
    overflow: hidden;
    isolation: isolate;
    padding: 22px var(--dm-pad) 16px;
    background-color: #fb2c36;
    background-image: linear-gradient(120deg, #c10007 0%, #fb2c36 52%, #ff6b6e 100%);
  }

  /* Огромные «%» на фоне. В макете белый на 10, 7 и 6% — знак почти не
     читался, тем более что бо́льшую часть карточки закрывают плитки. По
     просьбе владельца (23.10.2026) — втрое заметнее: 30, 22 и 19%. Белый
     заголовок поверх такого знака держит контраст выше 3:1, нормы для
     крупного текста. */
  .dm-glyph {
    position: absolute;
    z-index: 0;
    pointer-events: none;
    user-select: none;
    font-family: var(--font-sans);
    font-weight: 900;
    line-height: 0.8;
    letter-spacing: -0.04em;
  }
  .dm-glyph--a {
    left: -22px;
    top: -34px;
    font-size: 200px;
    color: rgb(255 255 255 / 0.3);
    transform: rotate(-10deg);
  }
  .dm-glyph--b {
    right: 6%;
    bottom: -62px;
    font-size: 210px;
    color: rgb(255 255 255 / 0.22);
    transform: rotate(12deg);
  }
  .dm-glyph--c {
    display: none;
    right: -30px;
    top: -40px;
    font-size: 220px;
    color: rgb(255 255 255 / 0.19);
    transform: rotate(8deg);
  }

  .dm-head {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 14px;
  }

  .dm-title {
    margin: 0;
    font-family: var(--font-sans);
    font-size: 26px;
    font-weight: 800;
    line-height: 1.12;
    letter-spacing: -0.025em;
    color: #fff;
    text-wrap: balance;
  }

  .dm-more {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 44px;
    padding: 0 14px;
    border: 1px solid rgb(255 255 255 / 0.32);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.16);
    -webkit-backdrop-filter: blur(6px);
    backdrop-filter: blur(6px);
    color: #fff;
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 700;
    text-decoration: none;
    white-space: nowrap;
    transition: background 0.15s ease;
  }
  .dm-more:hover {
    background: rgb(255 255 255 / 0.26);
    color: #fff;
  }
  .dm-more:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
  .dm-more__long {
    display: none;
  }

  .dm-stage {
    position: relative;
    z-index: 1;
  }

  /* Лента: сетка в две строки, поток по колонкам. Отрицательные поля
     выводят прокрутку к краям карточки, а внутренний отступ ставит первую
     плитку под заголовок. */
  .dm-rail {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, var(--dm-row));
    grid-auto-columns: var(--dm-col);
    gap: 8px;
    margin: 0 calc(-1 * var(--dm-pad));
    padding: 4px var(--dm-pad) 8px;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scroll-padding-inline: var(--dm-pad);
    scrollbar-width: none;
    -ms-overflow-style: none;
    touch-action: pan-x pan-y;
    cursor: grab;
    user-select: none;
  }
  .dm-rail::-webkit-scrollbar {
    display: none;
  }
  .dm-rail--dragging {
    scroll-snap-type: none;
    cursor: grabbing;
  }

  .dm-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    border-radius: 12px;
    background: #fff;
    color: inherit;
    text-decoration: none;
    scroll-snap-align: start;
    box-shadow: 0 1px 2px rgb(120 0 10 / 0.16);
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
    -webkit-user-drag: none;
  }
  .dm-tile:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 26px rgb(120 0 10 / 0.3);
  }
  .dm-tile:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 1px;
  }
  .dm-tile--big {
    grid-row: span 2;
    grid-column: span 2;
    border-radius: 16px;
  }

  .dm-media {
    position: relative;
    display: block;
    flex: 1;
    min-height: 0;
    margin: 5px 5px 0;
    border-radius: 8px;
    background: #fff;
  }
  .dm-tile--big .dm-media {
    margin: 6px 6px 0;
    border-radius: 12px;
  }

  /* Кадр вписан в поле с отступами макета (`padding: 7px 7px 26px` у мелкой —
     снизу место под плашку бонусов, `16px` у крупной). */
  .dm-img {
    position: absolute;
    top: 7px;
    left: 7px;
    width: calc(100% - 14px);
    height: calc(100% - 33px);
    object-fit: contain;
    -webkit-user-drag: none;
  }
  .dm-tile--big .dm-img {
    top: 16px;
    left: 16px;
    width: calc(100% - 32px);
    height: calc(100% - 32px);
  }

  .dm-badge {
    position: absolute;
    top: 3px;
    right: 3px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 4px 10px;
    border-radius: 8px;
    background: var(--discount);
    color: #fff;
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
    box-shadow:
      0 10px 15px -3px rgb(0 0 0 / 0.1),
      0 4px 6px -4px rgb(0 0 0 / 0.1);
  }
  .dm-tile--big .dm-badge {
    top: 8px;
    right: 8px;
  }

  .dm-bonus {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border: 1px solid var(--bonus-border);
    border-radius: 8px;
    background: var(--bonus-surface);
    color: var(--bonus);
    font-family: var(--font-sans);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.4;
    white-space: nowrap;
  }
  .dm-bonus--pin {
    position: absolute;
    left: 3px;
    bottom: 3px;
  }

  .dm-body {
    display: flex;
    flex-direction: column;
    padding: 6px 9px 9px;
  }
  .dm-tile--big .dm-body {
    align-items: flex-start;
    gap: 7px;
    padding: 10px 14px 14px;
  }

  .dm-name {
    display: -webkit-box;
    overflow: hidden;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    color: var(--foreground);
    font-family: var(--font-sans);
    font-size: 14px;
    font-weight: 600;
    line-height: 1.35;
    text-wrap: pretty;
  }

  .dm-price {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
    font-family: var(--font-sans);
  }
  .dm-price__now {
    color: var(--price);
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
  }
  .dm-price__old {
    color: var(--muted-foreground);
    font-size: 12px;
    line-height: normal;
    text-decoration: line-through;
    white-space: nowrap;
  }
  .dm-tile--big .dm-price {
    flex-direction: row;
    align-items: baseline;
    gap: 8px;
  }
  .dm-tile--big .dm-price__now {
    font-size: 20px;
  }
  .dm-tile--big .dm-price__old {
    font-size: 14px;
  }

  /* Стрелки — только с 640px: на телефоне ленту листают пальцем. */
  .dm-arrow {
    display: none;
    position: absolute;
    top: 50%;
    z-index: 3;
    transform: translateY(-50%);
    transition: opacity 0.15s ease;
  }
  .dm-arrow--prev {
    left: -18px;
  }
  .dm-arrow--next {
    right: -18px;
  }
  .dm-arrow--off {
    opacity: 0;
    pointer-events: none;
  }
  .dm-arrow__btn {
    display: grid;
    place-content: center;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 999px;
    background: #fff;
    color: var(--primary);
    cursor: pointer;
    box-shadow: 0 8px 20px rgb(120 0 10 / 0.28);
  }
  .dm-arrow__btn:hover {
    background: oklch(97% 0.014 254.604); /* blue-50 */
  }
  .dm-arrow__btn:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }

  @media (min-width: 640px) {
    .dm-wrap {
      width: 100%;
      max-width: 96rem; /* max-w-screen-2xl — общая ширина сайта */
      margin-inline: auto;
      padding-inline: var(--page-gutter);
    }

    .dm-card {
      --dm-col: 132px;
      --dm-row: 186px;
      --dm-pad: 32px;
      padding: 28px var(--dm-pad) 30px;
      border-radius: 24px;
      box-shadow: 0 20px 46px -20px rgb(251 44 54 / 0.7);
    }

    .dm-glyph--a {
      left: -34px;
      top: -64px;
      font-size: 300px;
    }
    .dm-glyph--b {
      right: 34%;
      bottom: -96px;
      font-size: 290px;
    }
    .dm-glyph--c {
      display: block;
    }

    .dm-head {
      align-items: center;
      margin-bottom: 20px;
    }
    .dm-title {
      font-size: clamp(26px, 2.6vw, 36px);
    }

    .dm-more {
      padding: 0 18px;
      font-size: 15px;
    }
    .dm-more__long {
      display: inline;
    }
    .dm-more__short {
      display: none;
    }

    .dm-arrow {
      display: block;
    }
  }
}
</style>
