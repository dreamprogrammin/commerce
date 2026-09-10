<script setup lang="ts">
/**
 * «Подобрать набор» — макет `Бренд LEGO.dc.html`, секция выбора.
 *
 * Три оси: возраст, цена, коллекция. Внутри оси — корзины со счётчиками; сетка
 * показывает первые четыре товара и раскрывается кнопкой.
 *
 * Отбор идёт по уже загруженным товарам бренда (их не больше двухсот), а не
 * запросом на каждый чип: страница и так тянет весь список ради серверной
 * разметки, и повторный поход в базу добавил бы задержку на ровном месте.
 */
import type { ProductLine, ProductWithGallery } from '@/types'

const props = defineProps<{
  brandName: string
  products: ProductWithGallery[]
  lines: ProductLine[]
  /** id товара → id коллекции. Выдача RPC своей линейки не отдаёт. */
  lineByProduct: Record<string, string>
  /** Коллекция, выбранная в панели шапки. */
  activeLineId?: string | null
}>()

const emit = defineEmits<{ 'update:activeLineId': [lineId: string | null] }>()

type Axis = 'age' | 'price' | 'line'

/** Сколько товаров показываем до нажатия «Показать ещё». */
const VISIBLE_LIMIT = 4

/*
 * Корзины возраста по НИЖНЕЙ границе товара, а не по пересечению отрезков.
 * Пересечение считает набор «4–12 лет» подходящим всем трём корзинам сразу:
 * у LEGO 14 товаров, а суммой по чипам выходило 27, и посетитель видел одни
 * и те же наборы под каждым возрастом.
 */
const AGE_BUCKETS = [
  { id: '4-6', label: '4–6 лет', from: 0, to: 6 },
  { id: '7-9', label: '7–9 лет', from: 7, to: 9 },
  { id: '10+', label: '10+ лет', from: 10, to: 200 },
]

const PRICE_BUCKETS = [
  { id: 'low', label: 'до 10 000 ₸', min: 0, max: 10000 },
  { id: 'mid', label: '10 000 – 30 000 ₸', min: 10000, max: 30000 },
  { id: 'high', label: 'от 30 000 ₸', min: 30000, max: Number.POSITIVE_INFINITY },
]

const axis = ref<Axis>('age')
const bucketId = ref<string | null>(null)
/** Раскрыть текущую корзину целиком — кнопка «Показать ещё». */
const showAll = ref(false)
/** Снять отбор совсем — кнопка «Все N товаров». */
const allProducts = ref(false)

const axes = computed(() => [
  { key: 'age' as Axis, label: 'По возрасту', icon: 'lucide:cake' },
  { key: 'price' as Axis, label: 'По цене', icon: 'lucide:wallet' },
  ...(props.lines.length
    ? [{ key: 'line' as Axis, label: 'По коллекции', icon: 'lucide:blocks' }]
    : []),
])

function productAge(product: ProductWithGallery) {
  return { min: (product as any).min_age_years as number | null }
}

function matches(product: ProductWithGallery, currentAxis: Axis, id: string): boolean {
  if (currentAxis === 'age') {
    const bucket = AGE_BUCKETS.find(b => b.id === id)
    if (!bucket)
      return false
    const { min } = productAge(product)
    if (min == null)
      return false
    return min >= bucket.from && min <= bucket.to
  }

  if (currentAxis === 'price') {
    const bucket = PRICE_BUCKETS.find(b => b.id === id)
    if (!bucket)
      return false
    const price = product.final_price ?? product.price
    return price >= bucket.min && price < bucket.max
  }

  return props.lineByProduct[product.id] === id
}

function countIn(currentAxis: Axis, id: string) {
  return props.products.filter(p => matches(p, currentAxis, id)).length
}

const buckets = computed(() => {
  if (axis.value === 'age')
    return AGE_BUCKETS.map(b => ({ id: b.id, label: b.label }))
  if (axis.value === 'price')
    return PRICE_BUCKETS.map(b => ({ id: b.id, label: b.label }))
  return props.lines.map(l => ({ id: l.id, label: l.name }))
})

/**
 * Корзина по умолчанию — первая непустая. Пустая на входе выглядела бы как
 * поломка: посетитель видит чипы и ни одного товара под ними.
 */
const activeBucket = computed(() => {
  if (bucketId.value && buckets.value.some(b => b.id === bucketId.value))
    return bucketId.value
  const filled = buckets.value.find(b => countIn(axis.value, b.id) > 0)
  return filled?.id ?? buckets.value[0]?.id ?? null
})

const matched = computed(() =>
  activeBucket.value
    ? props.products.filter(p => matches(p, axis.value, activeBucket.value!))
    : props.products,
)

const shown = computed(() =>
  showAll.value ? matched.value : matched.value.slice(0, VISIBLE_LIMIT),
)

const hasMore = computed(() => matched.value.length > shown.value.length)
const moreLabel = computed(() => `Показать ещё ${matched.value.length - shown.value.length}`)

const emptyTitle = computed(() => {
  const bucket = buckets.value.find(b => b.id === activeBucket.value)
  return axis.value === 'line' && bucket
    ? `Серия ${bucket.label} скоро приедет`
    : 'Наборы скоро приедут'
})

const totalLabel = computed(() => {
  const n = props.products.length
  const word = n % 10 === 1 && n % 100 !== 11
    ? 'товар'
    : [2, 3, 4].includes(n % 10) && (n % 100 < 10 || n % 100 >= 20)
        ? 'товара'
        : 'товаров'
  return `Все ${n} ${word}`
})

const notifyHref = computed(
  () => `mailto:info@uhti.kz?subject=${encodeURIComponent(`Новинки ${props.brandName}`)}`,
)

function pickAxis(next: Axis) {
  axis.value = next
  bucketId.value = null
  showAll.value = false
  allProducts.value = false
  if (next !== 'line')
    emit('update:activeLineId', null)
}

function pickBucket(id: string) {
  bucketId.value = id
  showAll.value = false
  allProducts.value = false
  if (axis.value === 'line')
    emit('update:activeLineId', id)
}

/**
 * Кнопка «Все N товаров» — макетная ссылка «Все 14 наборов»: снимает отбор
 * целиком. Отдельно от «Показать ещё», и это не педантизм: пока обе кнопки
 * работали одним флагом, раскрытие корзины молча показывало ВЕСЬ бренд —
 * чипы оставались подсвеченными, а под ними лежали чужие наборы.
 */
function showEverything() {
  bucketId.value = null
  showAll.value = false
  allProducts.value = true
}

function expandBucket() {
  showAll.value = true
}

const noBucketFilter = computed(() => allProducts.value)

// Панель коллекций в шапке выбирает серию — подборка переключается на неё.
watch(
  () => props.activeLineId,
  (lineId) => {
    if (!lineId)
      return
    axis.value = 'line'
    bucketId.value = lineId
    showAll.value = false
    allProducts.value = false
  },
)
</script>

<template>
  <section class="blp">
    <div class="blp__head">
      <div class="blp__head-text">
        <h2 class="blp__title">
          Подобрать набор
        </h2>
        <span class="blp__sub">
          Выберите возраст, бюджет или коллекцию — покажем подходящие товары.
        </span>
      </div>
      <button type="button" class="blp__all" @click="showEverything">
        {{ totalLabel }}
        <Icon name="lucide:arrow-right" class="size-4" />
      </button>
    </div>

    <div class="blp__tabs">
      <button
        v-for="item in axes"
        :key="item.key"
        type="button"
        class="blp__tab"
        :class="{ 'blp__tab--on': axis === item.key && !noBucketFilter }"
        @click="pickAxis(item.key)"
      >
        <Icon :name="item.icon" class="size-4" />
        {{ item.label }}
      </button>
    </div>

    <div class="blp__buckets">
      <button
        v-for="bucket in buckets"
        :key="bucket.id"
        type="button"
        class="blp__bucket"
        :class="{ 'blp__bucket--on': bucket.id === activeBucket && !noBucketFilter }"
        @click="pickBucket(bucket.id)"
      >
        {{ bucket.label }}
        <span
          class="blp__count"
          :class="{ 'blp__count--on': bucket.id === activeBucket && !noBucketFilter }"
        >{{ countIn(axis, bucket.id) }}</span>
      </button>
    </div>

    <div class="blp__grid">
      <ProductCard
        v-for="(product, index) in (noBucketFilter ? products : shown)"
        :key="product.id"
        :product="(product as any)"
        :position="index"
      />

      <!-- Пустая корзина: обещание вместо пустоты. -->
      <div v-if="matched.length === 0" class="blp__empty">
        <span class="blp__empty-icon">
          <Icon name="lucide:bell-ring" class="size-[23px]" />
        </span>
        <span class="blp__empty-text">
          <span class="blp__empty-title">{{ emptyTitle }}</span>
          <span class="blp__empty-note">
            Наборы этой серии уже в пути. Сообщим первыми, когда появятся
            в наличии в Алматы.
          </span>
        </span>
        <a :href="notifyHref" class="blp__notify">
          <Icon name="lucide:mail" class="size-[17px]" />
          Уведомить
        </a>
      </div>
    </div>

    <button
      v-if="hasMore && !noBucketFilter"
      type="button"
      class="blp__more"
      @click="expandBucket"
    >
      <Icon name="lucide:chevron-down" class="size-[18px] text-primary" />
      {{ moreLabel }}
    </button>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blp {
    margin-top: 28px;
  }

  .blp__head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
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
    font-size: 23px;
    letter-spacing: -0.025em;
  }

  .blp__sub {
    color: var(--muted-foreground);
    font-size: 14px;
  }

  .blp__all {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--primary);
    font-weight: 600;
    font-size: 14px;
    cursor: pointer;
  }

  .blp__tabs {
    display: inline-flex;
    gap: 4px;
    width: 100%;
    margin-bottom: 12px;
    padding: 4px;
    overflow-x: auto;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.8);
    box-shadow:
      inset 0 1px 0 #fff,
      0 5px 14px rgb(15 23 42 / 0.06);
    scrollbar-width: none;
  }

  .blp__tabs::-webkit-scrollbar,
  .blp__buckets::-webkit-scrollbar {
    display: none;
  }

  .blp__tab {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 8px;
    height: 44px;
    padding: 0 18px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: transparent;
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.14s ease;
  }

  .blp__tab--on {
    border-color: rgb(255 255 255 / 0.45);
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.9));
    color: #fff;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 8px 20px rgb(43 127 255 / 0.26);
  }

  .blp__buckets {
    display: flex;
    gap: 9px;
    overflow-x: auto;
    padding: 2px 2px 14px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .blp__bucket {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 9px;
    height: 44px;
    padding: 0 8px 0 17px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.6));
    color: var(--foreground);
    font-weight: 600;
    font-size: 14px;
    box-shadow:
      inset 0 1px 0 #fff,
      0 4px 12px rgb(15 23 42 / 0.06);
    scroll-snap-align: start;
    cursor: pointer;
    transition: background 0.14s ease;
  }

  .blp__bucket--on {
    border-color: rgb(43 127 255 / 0.3);
    background: rgb(43 127 255 / 0.1);
    color: var(--primary);
    box-shadow: none;
  }

  .blp__count {
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

  .blp__count--on {
    background: rgb(43 127 255 / 0.16);
    color: var(--primary);
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
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 22px;
    background: linear-gradient(155deg, #fff 0%, rgb(219 234 254 / 0.75) 100%);
    box-shadow:
      inset 0 1px 0 #fff,
      0 10px 26px rgb(15 23 42 / 0.07);
  }

  .blp__empty-icon {
    display: grid;
    place-content: center;
    width: 46px;
    height: 46px;
    border-radius: 15px;
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

  .blp__notify {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 8px;
    height: 46px;
    margin-top: 2px;
    padding: 0 20px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.65));
    color: var(--primary);
    font-weight: 700;
    font-size: 14px;
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(43 127 255 / 0.16);
  }

  .blp__more {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: 100%;
    height: 52px;
    margin-top: 14px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.6));
    color: var(--foreground);
    font-weight: 700;
    font-size: 15px;
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(15 23 42 / 0.07);
    cursor: pointer;
  }

  .blp__more:hover {
    background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.7));
  }

  @media (min-width: 760px) {
    .blp {
      margin-top: 44px;
    }

    .blp__title {
      font-size: 30px;
    }

    .blp__tabs {
      width: auto;
      overflow-x: visible;
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
