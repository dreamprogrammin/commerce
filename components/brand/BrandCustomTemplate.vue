<script setup lang="ts">
/**
 * Лендинг бренда — макет `Бренд LEGO v2.dc.html`.
 *
 * Показывается только бренду, которому админ поставил флаг собственной
 * страницы (`brands.is_custom_page`); остальные идут обычным шаблоном со
 * своим сайдбаром фильтров.
 *
 * Порядок полос макета: синяя шапка с витриной флагмана, липкое меню
 * разделов, полоса условий, мозаика серий, подборка с ползунками, карточки
 * по возрасту, тёмная полоса хита, лента «Рекомендуем», полоса бонусов,
 * текст о бренде со справкой, заявка на набор. Отзывы оставлены от прежней
 * версии — макет их не рисует, но и не отменяет.
 *
 * Полосы идут ВО ВСЮ ШИРИНУ экрана, поэтому страница не обёрнута общим
 * контейнером: ширину держит каждая полоса сама (см. `pages/brand/[slug].vue`).
 */
import type { BrandFilterState } from '@/composables/useBrandPageFilters'
import type { Brand, BrandFact, IBreadcrumbItem, ProductLine, ProductWithGallery } from '@/types'
import { brandStaticFaq, brandStaticText } from '@/constants/brandStaticText'

const props = defineProps<{
  brand: Brand
  productLines: ProductLine[]
  breadcrumbs: IBreadcrumbItem[]
  filterState: BrandFilterState
  /** id товара → id серии: выдача RPC своей линейки не отдаёт. */
  lineByProduct?: Record<string, string> | null
  /**
   * Витринные серии из `page_layout.featuredLineIds` — их админ помечает
   * руками. Отдельной полки для них в макете нет, поэтому они просто идут
   * первыми в мозаике.
   */
  featuredLineIds?: string[] | null
  /** Категории с индексируемым бренд-лендингом — плитки в справке. */
  categoryLinks?: { name: string, path: string }[] | null
  /** Раздел каталога, где лежат товары бренда: «Конструкторы», «Куклы». */
  topCategory?: string | null
  /** Товары того же раздела других брендов — лента «Рекомендуем». */
  recommended?: ProductWithGallery[] | null
}>()

const fs = props.filterState

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

/** Сколько товаров в каждой серии — для счётчиков мозаики. */
const lineCounts = computed(() => {
  const counts: Record<string, number> = {}
  for (const product of products.value) {
    const lineId = lineByProduct.value[product.id]
    if (lineId)
      counts[lineId] = (counts[lineId] ?? 0) + 1
  }
  return counts
})

/** Доля бонусов от цены — для полосы условий. Считается по товарам бренда. */
const bonusShare = computed(() => {
  const shares = products.value
    .map((p) => {
      const price = p.final_price ?? p.price
      const bonus = p.bonus_points_award ?? 0
      return price > 0 ? (bonus / price) * 100 : 0
    })
    .filter(value => value > 0)
  return shares.length ? Math.round(Math.max(...shares)) : 0
})

/** Серия, выбранная в мозаике; её же держит подборка. */
const activeLineId = ref<string | null>(null)
const collectionsDrawer = ref(false)

// ── Якоря разделов ──
const seriesRef = ref<HTMLElement | null>(null)
const pickRef = ref<HTMLElement | null>(null)
const hitRef = ref<HTMLElement | null>(null)
const aboutRef = ref<HTMLElement | null>(null)
const pickerRef = ref<{ applyAge: (lo: number, hi: number) => void } | null>(null)

const anchors = computed(() =>
  [
    orderedLines.value.length ? { key: 'series', label: 'Серии' } : null,
    products.value.length ? { key: 'pick', label: 'Подобрать' } : null,
    products.value.length > 1 ? { key: 'hit', label: 'Хит продаж' } : null,
    { key: 'about', label: 'О бренде' },
  ].filter(Boolean) as { key: string, label: string }[],
)

function jumpTo(key: string) {
  const targets: Record<string, HTMLElement | null> = {
    series: seriesRef.value,
    pick: pickRef.value,
    hit: hitRef.value,
    about: aboutRef.value,
  }
  targets[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function pickLine(lineId: string) {
  activeLineId.value = lineId
  jumpTo('pick')
}

function pickAge(lo: number, hi: number) {
  pickerRef.value?.applyAge(lo, hi)
  jumpTo('pick')
}

/*
 * Кнопка «Наверх». Страница длинная, а до шапки с середины подборки иначе не
 * добраться. Порог 420px — из макета.
 */
const showTopButton = ref(false)

function onScroll() {
  showTopButton.value = window.scrollY > 420
}

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
})

onBeforeUnmount(() => window.removeEventListener('scroll', onScroll))

/**
 * Текст о бренде. Статика из репозитория главнее того, что заведено в
 * админке: владелец попросил держать текст лендинга в коде и разрешил
 * перекрыть админский (см. `constants/brandStaticText.ts`).
 */
const aboutHtml = computed(
  () => brandStaticText(props.brand.slug) ?? props.brand.description ?? '',
)

/** Вопросы показываются на странице и из них же собирается разметка FAQPage. */
const faq = computed(() => brandStaticFaq(props.brand.slug))

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
    push('Серий', String(props.productLines.length))

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

  if (bonusShare.value > 0)
    push('Бонусы', `1 = 1 ₸, до ${bonusShare.value}% с покупки`)

  return [...own, ...derived]
})
</script>

<template>
  <div class="bct">
    <BrandLandingHero
      :brand="brand"
      :products="products"
      :lines="orderedLines"
      :breadcrumbs="breadcrumbs"
      @jump="jumpTo"
    />

    <BrandLandingSubnav :items="anchors" @jump="jumpTo" />

    <BrandLandingBenefits :bonus-share="bonusShare" />

    <div ref="seriesRef" class="bct__anchor">
      <BrandLandingCollections
        v-model:drawer-open="collectionsDrawer"
        :brand="brand"
        :lines="orderedLines"
        :line-counts="lineCounts"
        :active-line-id="activeLineId"
        @pick-line="pickLine"
      />
    </div>

    <div ref="pickRef" class="bct__anchor">
      <div v-if="fs.isLoading.value" class="bct__skeleton">
        <ProductGridSkeleton />
      </div>
      <BrandLandingPicker
        v-else-if="products.length > 0"
        ref="pickerRef"
        v-model:active-line-id="activeLineId"
        :brand-name="brand.name"
        :products="products"
        :lines="orderedLines"
        :line-by-product="lineByProduct"
      />
    </div>

    <BrandLandingAgeCards :products="products" @pick="pickAge" />

    <div ref="hitRef" class="bct__anchor">
      <BrandLandingSpotlight
        :products="products"
        :lines="orderedLines"
        :line-by-product="lineByProduct"
        :exclude-id="products[0]?.id ?? null"
      />
    </div>

    <BrandLandingRecommend
      :products="recommended ?? []"
      :category-name="topCategory"
    />

    <BrandLandingBonus :brand-name="brand.name" :products="products" />

    <!-- Текст о бренде и короткая справка — секция ABOUT макета. -->
    <div ref="aboutRef" class="bct__anchor bct__about-band">
      <div class="bct__inner">
        <section class="bct__about">
          <div class="bct__col">
            <article v-if="aboutHtml" class="bct__text" v-html="aboutHtml" />
            <BrandLandingFaq :items="faq" />
          </div>

          <aside class="bct__facts">
            <BrandFactsCard :facts="facts" />

            <!--
              Ссылки на бренд-лендинги в категориях. Рисуются НА СЕРВЕРЕ и
              только на адреса, открытые для индекса (отбор — на странице).
            -->
            <nav
              v-if="categoryLinks?.length"
              class="bct__cats"
              :aria-label="`${brand.name} в категориях`"
            >
              <NuxtLink
                v-for="link in categoryLinks"
                :key="link.path"
                :to="link.path"
                class="bct__cat"
              >
                <Icon name="lucide:blocks" class="size-4 text-primary" />
                {{ link.name }}
              </NuxtLink>
            </nav>
          </aside>
        </section>

        <!-- Отзывы о бренде. Макет их не рисует, но и не отменяет. -->
        <div class="bct__reviews">
          <BrandReviewsList :brand-id="brand.id" :brand-name="brand.name" />
        </div>
      </div>
    </div>

    <BrandLandingRequest :brand-name="brand.name" />

    <Transition name="bct-top">
      <button v-if="showTopButton" type="button" class="bct__top" @click="scrollToTop">
        <Icon name="lucide:arrow-up" class="size-[18px] text-primary" />
        Наверх
      </button>
    </Transition>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bct {
    display: flex;
    flex-direction: column;
  }

  /*
   * Отступ под плавающую капсулу разделов: она висит у верхнего края, и без
   * запаса прокрутка по якорю прятала бы заголовок секции под неё.
   */
  .bct__anchor {
    scroll-margin-top: 76px;
  }

  .bct__inner {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 var(--page-gutter);
  }

  .bct__skeleton {
    width: 100%;
    max-width: 1280px;
    margin: 0 auto;
    padding: 34px var(--page-gutter);
  }

  .bct__about-band {
    padding: 34px 0;
    background: var(--background);
  }

  .bct__about {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    align-items: start;
  }

  .bct__col {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .bct__text {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
    box-shadow: 0 4px 14px rgb(15 23 42 / 0.05);
  }

  .bct__facts {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bct__cats {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .bct__cat {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 42px;
    padding: 0 16px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
    color: var(--foreground);
    font-weight: 600;
    font-size: 13.5px;
  }

  .bct__cat:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .bct__reviews {
    margin-top: 28px;
  }

  /* «Наверх»: над таб-баром на телефоне, в углу на десктопе. */
  .bct__top {
    position: fixed;
    right: 14px;
    bottom: 104px;
    z-index: 150;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 46px;
    padding: 0 18px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.96);
    box-shadow: 0 10px 24px rgb(15 23 42 / 0.16);
    backdrop-filter: blur(12px) saturate(1.5);
    color: var(--foreground);
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }

  .bct-top-enter-active,
  .bct-top-leave-active {
    transition: opacity 0.2s ease;
  }

  .bct-top-enter-from,
  .bct-top-leave-to {
    opacity: 0;
  }

  /*
   * Типографика текста о бренде задаётся здесь: в статике лежит чистый HTML
   * без inline-стилей. `:deep`, потому что содержимое приходит через v-html.
   */
  .bct__text :deep(h2) {
    margin: 0 0 12px;
    color: var(--foreground);
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.025em;
    text-wrap: pretty;
  }

  .bct__text :deep(h3) {
    margin: 22px 0 10px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 17px;
    letter-spacing: -0.015em;
  }

  .bct__text :deep(p) {
    margin: 0 0 20px;
    color: var(--foreground);
    font-size: 15px;
    line-height: 1.72;
    text-wrap: pretty;
  }

  .bct__text :deep(p:last-child) {
    margin-bottom: 0;
  }

  .bct__text :deep(a) {
    color: var(--primary);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .bct__text :deep(ul) {
    display: flex;
    flex-direction: column;
    gap: 9px;
    margin: 0 0 20px;
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
    .bct__about-band {
      padding: 64px 0;
    }

    .bct__about,
    .bct__col {
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

    .bct__reviews {
      margin-top: 44px;
    }

    .bct__top {
      right: 26px;
      bottom: 26px;
    }
  }

  @media (min-width: 1200px) {
    .bct__about {
      grid-template-columns: minmax(0, 1fr) 330px;
    }
  }
}
</style>
