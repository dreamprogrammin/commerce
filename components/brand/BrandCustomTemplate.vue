<script setup lang="ts">
/**
 * Лендинг бренда — макет `Бренд LEGO.dc.html`.
 *
 * Показывается только тем брендам, которым админ поставил флаг собственной
 * страницы (`brands.is_custom_page`); остальные идут обычным шаблоном со
 * своим сайдбаром фильтров.
 *
 * Порядок секций макета: шапка бренда с витриной и коллекциями, подборка
 * «Подобрать набор», тёмная карточка хита, описание с фактами. Отзывы
 * оставлены от прежнего лендинга — макет их не отменяет, а страница без них
 * теряет живой отклик покупателей.
 */
import type { BrandFilterState } from '@/composables/useBrandPageFilters'
import type { Brand, BrandFact, IBreadcrumbItem, ProductLine } from '@/types'

const props = defineProps<{
  brand: Brand
  productLines: ProductLine[]
  breadcrumbs: IBreadcrumbItem[]
  filterState: BrandFilterState
  /** id товара → id коллекции: выдача RPC своей линейки не отдаёт. */
  lineByProduct?: Record<string, string> | null
  /**
   * Витринные коллекции из `page_layout.featuredLineIds` — их админ помечает
   * руками. В макете отдельной полки для них нет, поэтому они просто идут
   * первыми в панели коллекций.
   */
  featuredLineIds?: string[] | null
}>()

const fs = props.filterState

/**
 * Подложка бренда. В макете три темы; LEGO идёт жёлтой, остальные — синей
 * фирменной: собственного цвета у брендов в базе нет, а раскрашивать чужой
 * бренд в жёлтый LEGO нельзя.
 */
const TINTS: Record<string, { wash: string, accent: string, soft: string, glow: string, onDark: string }> = {
  lego: {
    wash: 'radial-gradient(120% 130% at 6% 0%,#fff5d1 0%,#ffffff 56%,#f7f9fc 100%)',
    accent: '#bf000a',
    soft: 'linear-gradient(158deg,#fffaea,#fff2c9)',
    glow: 'rgb(253 199 0 / 0.2)',
    onDark: '#fdc700',
  },
  default: {
    wash: 'radial-gradient(120% 130% at 6% 0%,#e8f1ff 0%,#ffffff 54%,#f7f9fc 100%)',
    accent: 'var(--primary)',
    soft: 'linear-gradient(158deg,#f3f8ff,#e4eefe)',
    glow: 'rgb(43 127 255 / 0.22)',
    onDark: '#8ec2ff',
  },
}

const tint = computed(() => TINTS[props.brand.slug] ?? TINTS.default!)

const tintVars = computed(() => ({
  '--brand-wash': tint.value.wash,
  '--brand-accent': tint.value.accent,
  '--brand-soft': tint.value.soft,
  '--brand-glow': tint.value.glow,
  '--brand-on-dark': tint.value.onDark,
}))

const products = computed(() => fs.products.value)

const orderedLines = computed(() => {
  const featured = new Set(props.featuredLineIds ?? [])
  if (featured.size === 0)
    return props.productLines
  return [
    ...props.productLines.filter(l => featured.has(l.id)),
    ...props.productLines.filter(l => !featured.has(l.id)),
  ]
})
const lineByProduct = computed(() => props.lineByProduct ?? {})

/** Сколько товаров в каждой коллекции — для панели в шапке. */
const lineCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const product of products.value) {
    const lineId = lineByProduct.value[product.id]
    if (lineId)
      counts[lineId] = (counts[lineId] ?? 0) + 1
  }
  return counts
})

/** Выбранная коллекция общая у панели в шапке и у подборки под ней. */
const activeLineId = ref<string | null>(null)

const pickerRef = ref<HTMLElement | null>(null)

function pickLine(lineId: string) {
  activeLineId.value = lineId
  pickerRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/**
 * «Коротко о бренде». Строки из админки идут первыми, к ним снизу
 * добавляется то, что страница знает сама, — без повторов по ключу.
 */
const facts = computed<BrandFact[]>(() => {
  const own = (props.brand.facts ?? []).filter(f => f?.k?.trim() && f?.v?.trim())
  const known = new Set(own.map(f => f.k.trim().toLowerCase()))

  const derived: BrandFact[] = []
  const push = (k: string, v: string) => {
    if (!known.has(k.toLowerCase()))
      derived.push({ k, v })
  }

  const inStock = products.value.filter(p => (p.stock_quantity ?? 0) > 0).length
  if (inStock > 0)
    push('Товаров в наличии', String(inStock))

  if (props.productLines.length > 0)
    push('Коллекций', String(props.productLines.length))

  const ages = products.value
    .map(p => (p as any).min_age_years as number | null)
    .filter((n): n is number => n != null)
  if (ages.length > 0) {
    const maxAges = products.value
      .map(p => (p as any).max_age_years as number | null)
      .filter((n): n is number => n != null)
    const from = Math.min(...ages)
    const to = maxAges.length ? Math.max(...maxAges) : null
    push('Возраст', to ? `от ${from} до ${to} лет` : `от ${from} лет`)
  }

  push('Бонусы', '1 = 1 ₸')

  return [...own, ...derived]
})
</script>

<template>
  <div class="bct" :style="tintVars">
    <Breadcrumbs :items="breadcrumbs" />

    <BrandLandingHero
      :brand="brand"
      :products="products"
      :lines="orderedLines"
      :line-counts="lineCounts"
      :active-line-id="activeLineId"
      @pick-line="pickLine"
    />

    <div ref="pickerRef">
      <ProductGridSkeleton v-if="fs.isLoading.value" />
      <BrandLandingPicker
        v-else-if="products.length > 0"
        v-model:active-line-id="activeLineId"
        :brand-name="brand.name"
        :products="products"
        :lines="orderedLines"
        :line-by-product="lineByProduct"
      />
    </div>

    <BrandLandingSpotlight
      :products="products"
      :lines="orderedLines"
      :line-by-product="lineByProduct"
      :exclude-id="products[0]?.id ?? null"
    />

    <!-- Описание бренда и короткая справка — секция ABOUT макета. -->
    <section v-if="brand.description || facts.length" class="bct__about">
      <article v-if="brand.description" class="bct__text" v-html="brand.description" />
      <BrandFactsCard :facts="facts" />
    </section>

    <!-- Отзывы о бренде. Макет их не рисует, но и не отменяет. -->
    <div class="bct__reviews">
      <BrandReviewsList :brand-id="brand.id" :brand-name="brand.name" />
    </div>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bct {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .bct__about {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    align-items: start;
    margin-top: 28px;
  }

  .bct__text {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 26px;
    background: var(--card);
    box-shadow: 0 8px 24px rgb(15 23 42 / 0.06);
  }

  .bct__reviews {
    margin-top: 28px;
  }

  /*
   * Типографика описания задаётся здесь, а не в редакторе: в базе лежит
   * чистый HTML без inline-стилей, и разметка у всех брендов одинаковая.
   * `:deep`, потому что содержимое приходит через v-html.
   */
  .bct__text :deep(h2) {
    margin: 0 0 12px;
    color: var(--foreground);
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.02em;
    text-wrap: pretty;
  }

  .bct__text :deep(h2:not(:first-child)),
  .bct__text :deep(h3:not(:first-child)) {
    margin-top: 22px;
  }

  .bct__text :deep(h3) {
    margin: 0 0 10px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.015em;
  }

  .bct__text :deep(p) {
    margin: 0 0 22px;
    color: var(--foreground);
    font-size: 15px;
    line-height: 1.72;
    text-wrap: pretty;
  }

  .bct__text :deep(p:last-child) {
    margin-bottom: 0;
  }

  .bct__text :deep(ul) {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Галочка вместо маркера — из макета: список читается как обещания. */
  .bct__text :deep(li) {
    position: relative;
    padding-left: 27px;
    color: var(--foreground);
    font-size: 14.5px;
    line-height: 1.6;
    text-wrap: pretty;
  }

  .bct__text :deep(li)::before {
    content: '';
    position: absolute;
    top: 4px;
    left: 0;
    width: 17px;
    height: 17px;
    background-color: var(--success);
    mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")
      center / contain no-repeat;
  }

  @media (min-width: 760px) {
    .bct {
      gap: 18px;
    }

    .bct__about,
    .bct__reviews {
      margin-top: 44px;
    }

    .bct__about {
      gap: 18px;
    }

    .bct__text {
      padding: 30px 32px;
    }

    .bct__text :deep(h2) {
      font-size: 26px;
    }

    .bct__text :deep(h3) {
      font-size: 19px;
    }
  }

  @media (min-width: 1200px) {
    .bct__about {
      grid-template-columns: minmax(0, 1fr) 340px;
    }
  }
}
</style>
