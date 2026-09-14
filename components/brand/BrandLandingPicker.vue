<script setup lang="ts">
/**
 * «Подобрать набор» — макет `Бренд LEGO v2.dc.html`, карточка фильтра.
 *
 * Два ползунка (возраст и цена), чипы тем и серий, счётчик найденного,
 * сортировка и сетка товаров. Отбор идёт по уже загруженным товарам бренда
 * (их не больше двухсот), а не запросом на каждое движение ползунка: страница
 * и так тянет весь список ради серверной разметки.
 *
 * Границы ползунков берутся из самих товаров, а не задаются константами:
 * иначе у бренда с другими ценами половина шкалы пустая.
 */
import type { ProductLine, ProductWithGallery } from '@/types'
import { BRAND_THEMES, matchesAge, matchesPrice, themesOf } from '@/utils/brandLandingFilters'
import { formatPrice } from '@/utils/formatPrice'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  brandName: string
  products: ProductWithGallery[]
  lines: ProductLine[]
  /** id товара → id серии. Выдача RPC своей линейки не отдаёт. */
  lineByProduct: Record<string, string>
  /** Серия, выбранная в мозаике выше. */
  activeLineId?: string | null
}>()

const emit = defineEmits<{ 'update:activeLineId': [lineId: string | null] }>()

/** Сколько товаров показываем до нажатия «Показать ещё». */
const VISIBLE_LIMIT = 8

const SORTS = [
  { id: 'popular', label: 'По популярности' },
  { id: 'cheap', label: 'Сначала дешевле' },
  { id: 'expensive', label: 'Сначала дороже' },
  { id: 'discount', label: 'Больше скидка' },
] as const

type SortId = (typeof SORTS)[number]['id']

// ── Границы ползунков ──
const ageBounds = computed(() => {
  const mins = props.products
    .map(p => (p as any).min_age_years as number | null)
    .filter((n): n is number => n != null)
  const maxs = props.products
    .map(p => (p as any).max_age_years as number | null)
    .filter((n): n is number => n != null)
  const lo = mins.length ? Math.min(...mins) : 1
  const hi = Math.max(maxs.length ? Math.max(...maxs) : 16, lo + 1)
  return { lo, hi }
})

const priceBounds = computed(() => {
  const prices = props.products.map(p => p.final_price ?? p.price).filter(n => n > 0)
  if (prices.length === 0)
    return { lo: 0, hi: 1000, step: 100 }
  // Округляем наружу до сотен: ползунок не должен отсекать крайний товар.
  const lo = Math.floor(Math.min(...prices) / 100) * 100
  const hi = Math.ceil(Math.max(...prices) / 100) * 100
  const span = Math.max(hi - lo, 100)
  return { lo, hi, step: span > 20000 ? 500 : 100 }
})

const ageLo = ref(0)
const ageHi = ref(0)
const priceLo = ref(0)
const priceHi = ref(0)
const themeKey = ref<string | null>(null)
const lineId = ref<string | null>(null)
const sortId = ref<SortId>('popular')
const showAll = ref(false)

function resetRanges() {
  ageLo.value = ageBounds.value.lo
  ageHi.value = ageBounds.value.hi
  priceLo.value = priceBounds.value.lo
  priceHi.value = priceBounds.value.hi
}
resetRanges()
watch([ageBounds, priceBounds], resetRanges)

// ── Отбор ──
function lineNameOf(product: ProductWithGallery) {
  const id = props.lineByProduct[product.id]
  return props.lines.find(l => l.id === id)?.name ?? null
}

function matches(product: ProductWithGallery) {
  if (!matchesAge(product, ageLo.value, ageHi.value, ageBounds.value))
    return false
  if (!matchesPrice(product, priceLo.value, priceHi.value))
    return false
  if (themeKey.value && !themesOf(product, lineNameOf(product)).includes(themeKey.value))
    return false
  if (lineId.value && props.lineByProduct[product.id] !== lineId.value)
    return false
  return true
}

function sortProducts(list: ProductWithGallery[]) {
  const out = [...list]
  if (sortId.value === 'cheap')
    return out.sort((a, b) => (a.final_price ?? a.price) - (b.final_price ?? b.price))
  if (sortId.value === 'expensive')
    return out.sort((a, b) => (b.final_price ?? b.price) - (a.final_price ?? a.price))
  if (sortId.value === 'discount')
    return out.sort((a, b) => (b.discount_percentage ?? 0) - (a.discount_percentage ?? 0))
  return out.sort((a, b) => (b.sales_count ?? 0) - (a.sales_count ?? 0))
}

const matched = computed(() => sortProducts(props.products.filter(matches)))
const shown = computed(() => (showAll.value ? matched.value : matched.value.slice(0, VISIBLE_LIMIT)))
const hasMore = computed(() => matched.value.length > shown.value.length)
const moreLabel = computed(() => `Показать ещё ${matched.value.length - shown.value.length}`)

const matchedLabel = computed(() => {
  const n = matched.value.length
  return `${n} ${pluralRu(n, 'набор', 'набора', 'наборов')}`
})

// ── Чипы ──
const themeChips = computed(() => {
  const counts = new Map<string, number>()
  for (const product of props.products) {
    for (const key of themesOf(product, lineNameOf(product)))
      counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return BRAND_THEMES.filter(theme => (counts.get(theme.key) ?? 0) > 0).map(theme => ({
    key: theme.key,
    label: theme.label,
    count: counts.get(theme.key) ?? 0,
  }))
})

const lineChips = computed(() =>
  props.lines
    .map(line => ({
      key: line.id,
      label: line.name,
      count: props.products.filter(p => props.lineByProduct[p.id] === line.id).length,
    }))
    .filter(chip => chip.count > 0),
)

const isFiltered = computed(
  () =>
    themeKey.value !== null
    || lineId.value !== null
    || ageLo.value !== ageBounds.value.lo
    || ageHi.value !== ageBounds.value.hi
    || priceLo.value !== priceBounds.value.lo
    || priceHi.value !== priceBounds.value.hi,
)

const emptyTitle = computed(() => {
  const line = props.lines.find(l => l.id === lineId.value)
  return line ? `Серия ${line.name} скоро приедет` : 'Под такой отбор пока ничего нет'
})

// ── Подписи ползунков ──
const ageLabel = computed(() => `${ageLo.value}–${ageHi.value >= ageBounds.value.hi ? `${ageBounds.value.hi}+` : ageHi.value} лет`)
const priceLabel = computed(() => `${formatPrice(priceLo.value)} – ${formatPrice(priceHi.value)} ₸`)

function fraction(value: number, lo: number, hi: number) {
  return hi === lo ? 0 : (value - lo) / (hi - lo)
}

const ageFill = computed(() => ({
  left: `calc(${fraction(ageLo.value, ageBounds.value.lo, ageBounds.value.hi) * 100}% )`,
  width: `${(fraction(ageHi.value, ageBounds.value.lo, ageBounds.value.hi) - fraction(ageLo.value, ageBounds.value.lo, ageBounds.value.hi)) * 100}%`,
}))

const priceFill = computed(() => ({
  left: `calc(${fraction(priceLo.value, priceBounds.value.lo, priceBounds.value.hi) * 100}% )`,
  width: `${(fraction(priceHi.value, priceBounds.value.lo, priceBounds.value.hi) - fraction(priceLo.value, priceBounds.value.lo, priceBounds.value.hi)) * 100}%`,
}))

// ── Действия ──
function onAgeLo(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  ageLo.value = Math.min(value, ageHi.value)
  showAll.value = false
}

function onAgeHi(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  ageHi.value = Math.max(value, ageLo.value)
  showAll.value = false
}

function onPriceLo(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  priceLo.value = Math.min(value, priceHi.value)
  showAll.value = false
}

function onPriceHi(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  priceHi.value = Math.max(value, priceLo.value)
  showAll.value = false
}

function pickTheme(key: string) {
  themeKey.value = themeKey.value === key ? null : key
  showAll.value = false
}

function pickLine(id: string) {
  const next = lineId.value === id ? null : id
  lineId.value = next
  showAll.value = false
  emit('update:activeLineId', next)
}

function pickSort(next: string) {
  if (!SORTS.some(s => s.id === next))
    return
  sortId.value = next as SortId
  showAll.value = false
}

function reset() {
  resetRanges()
  themeKey.value = null
  lineId.value = null
  showAll.value = false
  emit('update:activeLineId', null)
}

/** Возрастная карточка выше задаёт отрезок и ведёт сюда. */
function applyAge(lo: number, hi: number) {
  ageLo.value = Math.max(lo, ageBounds.value.lo)
  ageHi.value = Math.min(hi, ageBounds.value.hi)
  themeKey.value = null
  lineId.value = null
  priceLo.value = priceBounds.value.lo
  priceHi.value = priceBounds.value.hi
  showAll.value = false
  emit('update:activeLineId', null)
}

defineExpose({ applyAge })

// Мозаика серий выше выбирает серию — подборка переключается на неё.
watch(
  () => props.activeLineId,
  (next) => {
    if (next === undefined)
      return
    lineId.value = next
    showAll.value = false
  },
)
</script>

<template>
  <section class="blp">
    <div class="blp__inner">
      <div class="blp__head">
        <div class="blp__head-text">
          <h2 class="blp__title">
            Подобрать набор
          </h2>
          <span class="blp__sub">
            По интересу ребёнка, возрасту, бюджету или серии
          </span>
        </div>
        <span class="blp__head-count">{{ matchedLabel }}</span>
      </div>

      <div class="blp__card">
        <div class="blp__sliders">
          <div class="blp__band">
            <span class="blp__band-label">Возраст</span>
            <span class="blp__range">
              <span class="blp__track" />
              <span class="blp__fill" :style="ageFill" />
              <span class="blp__cap">{{ ageLabel }}</span>
              <input
                class="blp__input"
                type="range"
                :min="ageBounds.lo"
                :max="ageBounds.hi"
                step="1"
                :value="ageLo"
                aria-label="Возраст от"
                @input="onAgeLo"
              >
              <input
                class="blp__input"
                type="range"
                :min="ageBounds.lo"
                :max="ageBounds.hi"
                step="1"
                :value="ageHi"
                aria-label="Возраст до"
                @input="onAgeHi"
              >
            </span>
          </div>

          <div class="blp__band">
            <span class="blp__band-label">Цена</span>
            <span class="blp__range">
              <span class="blp__track" />
              <span class="blp__fill" :style="priceFill" />
              <span class="blp__cap">{{ priceLabel }}</span>
              <input
                class="blp__input"
                type="range"
                :min="priceBounds.lo"
                :max="priceBounds.hi"
                :step="priceBounds.step"
                :value="priceLo"
                aria-label="Цена от"
                @input="onPriceLo"
              >
              <input
                class="blp__input"
                type="range"
                :min="priceBounds.lo"
                :max="priceBounds.hi"
                :step="priceBounds.step"
                :value="priceHi"
                aria-label="Цена до"
                @input="onPriceHi"
              >
            </span>
          </div>
        </div>

        <div v-if="themeChips.length > 1" class="blp__block">
          <span class="blp__block-title">Интерес</span>
          <div class="blp__chips">
            <button
              v-for="chip in themeChips"
              :key="chip.key"
              type="button"
              class="blp__chip"
              :class="{ 'blp__chip--on': chip.key === themeKey }"
              @click="pickTheme(chip.key)"
            >
              {{ chip.label }}
              <span class="blp__chip-count" :class="{ 'blp__chip-count--on': chip.key === themeKey }">
                {{ chip.count }}
              </span>
            </button>
          </div>
        </div>

        <div v-if="lineChips.length > 1" class="blp__block">
          <span class="blp__block-title">Серия</span>
          <div class="blp__chips">
            <button
              v-for="chip in lineChips"
              :key="chip.key"
              type="button"
              class="blp__chip"
              :class="{ 'blp__chip--on': chip.key === lineId }"
              @click="pickLine(chip.key)"
            >
              {{ chip.label }}
              <span class="blp__chip-count" :class="{ 'blp__chip-count--on': chip.key === lineId }">
                {{ chip.count }}
              </span>
            </button>
          </div>
        </div>

        <div class="blp__foot">
          <span class="blp__foot-left">
            <span class="blp__found">{{ matchedLabel }}</span>
            <button v-if="isFiltered" type="button" class="blp__reset" @click="reset">
              <Icon name="lucide:x" class="size-[14px]" />
              Сбросить
            </button>
          </span>

          <label class="blp__sort">
            <Icon name="lucide:arrow-up-down" class="size-4 text-primary" />
            <select
              class="blp__sort-select"
              :value="sortId"
              aria-label="Порядок товаров"
              @change="pickSort(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="option in SORTS" :key="option.id" :value="option.id">
                {{ option.label }}
              </option>
            </select>
            <Icon name="lucide:chevron-down" class="size-[15px] text-muted-foreground" />
          </label>
        </div>
      </div>

      <div class="blp__grid">
        <ProductCard
          v-for="(product, index) in shown"
          :key="product.id"
          :product="(product as any)"
          :position="index"
        />

        <!-- Пустой отбор: обещание вместо пустоты. -->
        <div v-if="matched.length === 0" class="blp__empty">
          <span class="blp__empty-icon">
            <Icon name="lucide:bell-ring" class="size-[22px]" />
          </span>
          <span class="blp__empty-text">
            <span class="blp__empty-title">{{ emptyTitle }}</span>
            <span class="blp__empty-note">
              Наборы уже в пути. Сообщим первыми, когда они появятся
              в наличии в Алматы.
            </span>
          </span>
          <button type="button" class="blp__empty-reset" @click="reset">
            <Icon name="lucide:rotate-ccw" class="size-4" />
            Сбросить отбор
          </button>
        </div>
      </div>

      <button v-if="hasMore" type="button" class="blp__more" @click="showAll = true">
        <Icon name="lucide:chevron-down" class="size-[18px] text-primary" />
        {{ moreLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blp {
    padding: 34px 0;
    background: var(--page-surface, #f2f4f8);
  }

  .blp__inner {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .blp__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }

  .blp__head-text {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .blp__title {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 24px;
    letter-spacing: -0.03em;
  }

  .blp__sub {
    color: var(--muted-foreground);
    font-size: 14.5px;
  }

  .blp__head-count {
    color: var(--muted-foreground);
    font-weight: 600;
    font-size: 13.5px;
  }

  .blp__card {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 16px;
    padding: 16px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
    box-shadow: 0 4px 16px rgb(15 23 42 / 0.06);
  }

  .blp__sliders {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .blp__band {
    display: flex;
    align-items: center;
    gap: 12px;
    /* Место справа под подпись значения. */
    padding-right: 6px;
    min-width: 0;
    padding: 8px 14px;
    border-radius: 14px;
    background: var(--muted);
  }

  .blp__band-label {
    flex: none;
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  /* Двойной ползунок: две дорожки поверх одной шкалы. */
  .blp__range {
    position: relative;
    flex: 1;
    min-width: 0;
    height: 52px;
  }

  .blp__track,
  .blp__fill {
    position: absolute;
    top: 33px;
    height: 6px;
    border-radius: 999px;
  }

  .blp__track {
    right: 0;
    left: 0;
    background: rgb(11 74 143 / 0.16);
  }

  .blp__fill {
    background: var(--primary);
  }

  /* Подпись — НАД дорожкой: на одной линии её перекрывал правый бегунок. */
  .blp__cap {
    position: absolute;
    top: 2px;
    right: 2px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 12.5px;
    white-space: nowrap;
    pointer-events: none;
  }

  /*
   * Оба `input` лежат друг на друге и прозрачны: видимой остаётся дорожка
   * выше. События берут только бегунки, иначе верхний вход перехватывал бы
   * нажатия по всей ширине и нижний бегунок стал бы недоступен.
   */
  .blp__input {
    position: absolute;
    top: 25px;
    left: 0;
    width: 100%;
    height: 22px;
    margin: 0;
    background: transparent;
    pointer-events: none;
    appearance: none;
  }

  .blp__input::-webkit-slider-thumb {
    width: 22px;
    height: 22px;
    border: 2px solid #fff;
    border-radius: 999px;
    background: var(--primary);
    box-shadow: 0 2px 8px rgb(6 20 44 / 0.28);
    cursor: pointer;
    pointer-events: auto;
    appearance: none;
  }

  .blp__input::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border: 2px solid #fff;
    border-radius: 999px;
    background: var(--primary);
    box-shadow: 0 2px 8px rgb(6 20 44 / 0.28);
    cursor: pointer;
    pointer-events: auto;
  }

  .blp__block {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    padding-top: 2px;
    border-top: 1px solid var(--border);
  }

  .blp__block-title {
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .blp__chips {
    display: flex;
    gap: 9px;
    min-width: 0;
    padding: 4px 2px 2px;
    overflow-x: auto;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .blp__chips::-webkit-scrollbar {
    display: none;
  }

  .blp__chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 9px;
    height: 42px;
    padding: 0 8px 0 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--foreground);
    font-weight: 600;
    font-size: 14px;
    white-space: nowrap;
    scroll-snap-align: start;
    cursor: pointer;
  }

  .blp__chip--on {
    border-color: var(--primary);
    background: rgb(43 127 255 / 0.1);
    color: var(--primary);
  }

  .blp__chip-count {
    display: grid;
    place-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 7px;
    border-radius: 999px;
    background: var(--muted);
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 12px;
  }

  .blp__chip-count--on {
    background: rgb(43 127 255 / 0.16);
    color: var(--primary);
  }

  .blp__foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-top: 2px;
    border-top: 1px solid var(--border);
  }

  .blp__foot-left {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .blp__found {
    color: var(--foreground);
    font-weight: 700;
    font-size: 14px;
  }

  .blp__reset {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 34px;
    padding: 0 13px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--muted-foreground);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }

  .blp__reset:hover {
    color: var(--foreground);
  }

  .blp__sort {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 42px;
    padding: 0 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
  }

  .blp__sort-select {
    border: none;
    background: transparent;
    color: var(--foreground);
    font-weight: 600;
    font-size: 13.5px;
    outline: none;
    cursor: pointer;
    appearance: none;
  }

  .blp__grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    align-items: stretch;
  }

  .blp__empty {
    display: flex;
    grid-column: span 2;
    flex-direction: column;
    gap: 12px;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
  }

  .blp__empty-icon {
    display: grid;
    place-content: center;
    width: 44px;
    height: 44px;
    border-radius: 14px;
    background: rgb(43 127 255 / 0.12);
    color: var(--primary);
  }

  .blp__empty-text {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .blp__empty-title {
    color: var(--foreground);
    font-weight: 700;
    font-size: 17px;
  }

  .blp__empty-note {
    max-width: 40ch;
    color: var(--muted-foreground);
    font-size: 14px;
    line-height: 1.5;
    text-wrap: pretty;
  }

  .blp__empty-reset {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 19px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--primary);
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }

  .blp__more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: 100%;
    height: 52px;
    margin-top: 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--foreground);
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }

  .blp__more:hover {
    background: var(--muted);
  }

  @media (min-width: 760px) {
    .blp {
      padding: 64px 0;
    }

    .blp__title {
      font-size: 34px;
    }

    .blp__head {
      margin-bottom: 22px;
    }

    .blp__card {
      gap: 16px;
      margin-bottom: 22px;
      padding: 22px 24px;
    }

    .blp__sliders {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 18px;
    }

    .blp__sort {
      width: auto;
    }

    .blp__grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }

    .blp__empty {
      grid-column: span 3;
      padding: 26px 28px;
    }
  }

  @media (min-width: 1200px) {
    .blp__grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .blp__empty {
      grid-column: span 4;
    }
  }
}
</style>
