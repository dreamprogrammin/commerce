<script setup lang="ts">
/**
 * Шапка лендинга бренда — макет `Бренд LEGO.dc.html`, секция HERO.
 *
 * Одна карточка с тёплой подложкой: логотип, название, короткое описание,
 * полоса доверия, витрина флагманского товара и панель коллекций. Показывается
 * только на странице бренда с собственным лендингом (флаг ставит админ).
 */
import type { Brand, ProductLine, ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT, BUCKET_NAME_PRODUCT_LINES } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice } from '@/utils/formatPrice'

const props = defineProps<{
  brand: Brand
  /** Товары бренда — первый идёт витриной. */
  products: ProductWithGallery[]
  lines: ProductLine[]
  /** Сколько активных товаров в каждой коллекции. */
  lineCounts: Record<string, number>
  /** Коллекция, выбранная в подборке ниже: панель подсвечивает её же. */
  activeLineId?: string | null
}>()

const emit = defineEmits<{ pickLine: [lineId: string] }>()

const { getVariantUrl } = useSupabaseStorage()
const cartStore = useCartStore()
const { flyToCart } = useCartFly()

/*
 * Витрина — первый товар выдачи. Отдельного поля «флагман» в базе нет, и
 * заводить его ради картинки значило бы просить владельца вести ещё один
 * список руками; порядок задаёт сортировка страницы.
 */
const hero = computed(() => props.products[0] ?? null)
// Ссылка — компонент, поэтому у неё берётся `$el`: полёт в корзину считает
// координаты по настоящему узлу картинки.
const heroImageRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const heroImageEl = computed<HTMLElement | null>(() => {
  const node = heroImageRef.value as any
  return (node?.$el ?? node ?? null) as HTMLElement | null
})

const logoUrl = computed(() =>
  props.brand.logo_url
    ? getVariantUrl(BUCKET_NAME_BRANDS, props.brand.logo_url, 'sm')
    : null,
)

function productImage(product: ProductWithGallery | null, variant: 'sm' | 'md' = 'md') {
  const path = product?.product_images?.[0]?.image_url
  return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, variant) : null
}

const heroImage = computed(() => productImage(hero.value))

/**
 * Надстрочник по макету: «Бренд · Дания, с 1932 года». Страна и год живут в
 * `brands.facts` и заполняются вручную, поэтому строка собирается из того,
 * что есть: пока поле пустое — остаётся одно слово «Бренд».
 */
const eyebrow = computed(() => {
  const facts = props.brand.facts ?? []
  const value = (key: string) =>
    facts.find(f => f?.k?.toLowerCase().startsWith(key))?.v?.trim()

  const country = value('стран')
  const founded = value('основан')

  return ['Бренд', country, founded && `с ${founded.replace(/\s*год\w*$/i, '')} года`]
    .filter(Boolean)
    .join(' · ')
})

const lead = computed(() => props.brand.seo_description || '')

const inStockCount = computed(
  () => props.products.filter(p => (p.stock_quantity ?? 0) > 0).length,
)

const trust = computed(() => [
  { icon: 'lucide:shield-check', label: 'Оригинал и сертификаты', kind: 'ok' },
  {
    icon: 'lucide:package',
    label: `${inStockCount.value} ${plural(inStockCount.value, 'товар', 'товара', 'товаров')} в наличии`,
    kind: 'info',
  },
  { icon: 'lucide:truck', label: 'Доставим за 1–2 дня', kind: 'warm' },
  { icon: 'lucide:gift', label: 'Бонусы 1 = 1 ₸', kind: 'pink' },
])

function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11)
    return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return few
  return many
}

const seriesLabel = computed(
  () => `${props.lines.length} ${plural(props.lines.length, 'серия', 'серии', 'серий')}`,
)

const collections = computed(() =>
  props.lines.map((line) => {
    const count = props.lineCounts[line.id] ?? 0
    return {
      id: line.id,
      name: line.name,
      href: `/brand/${props.brand.slug}/${line.slug}`,
      thumb: line.logo_url
        ? getVariantUrl(BUCKET_NAME_PRODUCT_LINES, line.logo_url, 'sm')
        : null,
      countLabel: count
        ? `${count} ${plural(count, 'набор', 'набора', 'наборов')}`
        : 'Скоро в наличии',
      isEmpty: count === 0,
    }
  }),
)

const heroMeta = computed(() => {
  if (!hero.value)
    return ''
  const line = props.lines.find(l => l.id === (hero.value as any)?.product_line_id)
  const age = ageLabel(hero.value)
  return [line?.name, age].filter(Boolean).join(' · ')
})

function ageLabel(product: ProductWithGallery): string {
  const min = (product as any).min_age_years as number | null
  const max = (product as any).max_age_years as number | null
  if (min == null)
    return ''
  return max ? `${min}–${max} лет` : `от ${min} лет`
}

const heroPrice = computed(() => {
  const product = hero.value
  if (!product)
    return null
  const final = product.final_price ?? product.price
  return {
    final,
    old: product.discount_percentage ? product.price : null,
    discount: product.discount_percentage
      ? `−${Math.round(product.discount_percentage)}%`
      : '',
    bonus: product.bonus_points_award ?? 0,
  }
})

function addHeroToCart(event: MouseEvent) {
  if (!hero.value)
    return
  // До добавления: кнопка остаётся на месте, но рект источника берём заранее.
  flyToCart(heroImageEl.value, undefined, event.currentTarget as HTMLElement)
  cartStore.addItem(hero.value as any, 1)
}
</script>

<template>
  <section class="blh">
    <!-- Бренд: логотип, имя, короткое описание -->
    <div class="blh__brand">
      <span v-if="logoUrl" class="blh__logo">
        <ProgressiveImage
          :src="logoUrl"
          :alt="`Логотип ${brand.name}`"
          object-fit="contain"
          placeholder-type="shimmer"
          :use-transform="false"
          eager
          class="size-full"
        />
      </span>

      <div class="blh__title">
        <span class="blh__eyebrow">{{ eyebrow }}</span>
        <h1 class="blh__h1">
          {{ brand.seo_h1 || brand.name }}
        </h1>
        <p v-if="lead" class="blh__lead">
          {{ lead }}
        </p>
      </div>

      <NuxtLink to="/brands" class="blh__all">
        <Icon name="lucide:layout-grid" class="size-[17px] text-primary" />
        Все бренды
      </NuxtLink>
    </div>

    <!-- Полоса доверия -->
    <div class="blh__trust">
      <span
        v-for="item in trust"
        :key="item.label"
        class="blh__chip"
        :class="`blh__chip--${item.kind}`"
      >
        <Icon :name="item.icon" class="size-[15px]" />
        {{ item.label }}
      </span>
    </div>

    <div class="blh__split">
      <!-- Витрина флагмана -->
      <div v-if="hero && heroPrice" class="blh__feat">
        <NuxtLink
          ref="heroImageRef"
          :to="`/catalog/products/${hero.slug}`"
          class="blh__feat-img"
        >
          <!-- `!bg-transparent`: серая подложка ProgressiveImage при
               object-fit: contain вылезает полями по бокам и рисует белый
               прямоугольник поверх тёплой карточки. Тот же приём — в галерее
               товара. -->
          <ProgressiveImage
            v-if="heroImage"
            :src="heroImage"
            :alt="hero.name"
            object-fit="contain"
            placeholder-type="shimmer"
            eager
            class="size-full !bg-transparent"
          />
          <span v-if="heroPrice.discount" class="blh__discount">
            {{ heroPrice.discount }}
          </span>
        </NuxtLink>

        <div class="blh__feat-body">
          <span class="blh__feat-eyebrow">
            <Icon name="lucide:sparkles" class="size-[15px] blh__accent-icon" />
            Флагман бренда
          </span>
          <NuxtLink :to="`/catalog/products/${hero.slug}`" class="blh__feat-name">
            {{ hero.name }}
          </NuxtLink>
          <span v-if="heroMeta" class="blh__feat-meta">{{ heroMeta }}</span>

          <span class="blh__prices">
            <span class="blh__price">{{ formatPrice(heroPrice.final) }}&nbsp;₸</span>
            <span v-if="heroPrice.old" class="blh__price-old">
              {{ formatPrice(heroPrice.old) }}&nbsp;₸
            </span>
          </span>

          <span v-if="heroPrice.bonus > 0" class="blh__bonus">
            <Icon name="lucide:gift" class="size-[15px] blh__bonus-icon" />
            +{{ formatPrice(heroPrice.bonus) }} бонусов
          </span>

          <div class="blh__actions">
            <button type="button" class="blh__cta" @click="addHeroToCart">
              <Icon name="solar:cart-3-bold" class="size-[19px]" />
              В корзину
            </button>
            <NuxtLink :to="`/catalog/products/${hero.slug}`" class="blh__ghost">
              Подробнее
              <Icon name="lucide:arrow-right" class="size-[17px] text-primary" />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Панель коллекций -->
      <div v-if="collections.length" class="blh__panel">
        <div class="blh__panel-head">
          <span class="blh__panel-title">Коллекции</span>
          <span class="blh__panel-count">
            {{ seriesLabel }}
            <Icon name="lucide:blocks" class="size-[15px] blh__accent-icon" />
          </span>
        </div>

        <div class="blh__panel-list">
          <button
            v-for="collection in collections"
            :key="collection.id"
            type="button"
            class="blh__col"
            :class="{ 'blh__col--on': collection.id === activeLineId }"
            @click="emit('pickLine', collection.id)"
          >
            <span
              class="blh__col-thumb"
              :style="collection.thumb ? { backgroundImage: `url(${collection.thumb})` } : undefined"
            />
            <span class="blh__col-text">
              <span class="blh__col-name">{{ collection.name }}</span>
              <span
                class="blh__col-count"
                :class="{ 'blh__col-count--empty': collection.isEmpty }"
              >{{ collection.countLabel }}</span>
            </span>
            <Icon name="lucide:chevron-right" class="blh__col-chevron size-[17px]" />
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blh {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 20px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 24px;
    /* Подложка бренда: тёплая радиальная растяжка из макета. */
    background: var(--brand-wash);
    box-shadow:
      inset 0 1px 0 #fff,
      0 18px 44px rgb(15 23 42 / 0.09);
  }

  .blh__brand {
    display: flex;
    align-items: flex-start;
    gap: 14px;
  }

  .blh__logo {
    display: grid;
    flex: none;
    place-content: center;
    width: 72px;
    height: 72px;
    padding: 9px;
    border: 1px solid rgb(255 255 255 / 0.95);
    border-radius: 18px;
    background: #fff;
    box-shadow:
      inset 0 1px 0 #fff,
      0 10px 24px rgb(15 23 42 / 0.12);
  }

  .blh__title {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
  }

  .blh__eyebrow {
    color: var(--brand-accent);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .blh__h1 {
    margin: 0;
    color: var(--foreground);
    font-weight: 800;
    font-size: 38px;
    line-height: 0.98;
    letter-spacing: -0.035em;
  }

  .blh__lead {
    margin: 2px 0 0;
    max-width: 44ch;
    color: var(--muted-foreground);
    font-size: 14px;
    line-height: 1.55;
    text-wrap: pretty;
  }

  /* Кнопка «Все бренды» помещается только на широком экране. */
  .blh__all {
    display: none;
  }

  .blh__trust {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 2px;
    scrollbar-width: none;
  }

  .blh__trust::-webkit-scrollbar {
    display: none;
  }

  .blh__chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 14px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 12.5px;
  }

  .blh__chip--ok {
    background: rgb(0 188 125 / 0.12);
    color: #007a55;
  }

  .blh__chip--info {
    background: rgb(43 127 255 / 0.12);
    color: var(--primary);
  }

  .blh__chip--warm {
    background: var(--bonus-surface);
    color: var(--bonus);
  }

  .blh__chip--pink {
    background: rgb(230 0 118 / 0.1);
    color: #c2185b;
  }

  .blh__split {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .blh__feat {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .blh__feat-img {
    position: relative;
    display: block;
    overflow: hidden;
    aspect-ratio: 4 / 3;
    padding: 18px;
    border: 1px solid rgb(255 255 255 / 0.85);
    border-radius: 20px;
    background: var(--brand-soft);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.9),
      0 10px 26px rgb(15 23 42 / 0.08);
  }

  .blh__discount {
    position: absolute;
    top: 14px;
    left: 14px;
    padding: 6px 13px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    box-shadow: 0 6px 16px rgb(231 0 11 / 0.28);
  }

  .blh__feat-body {
    display: flex;
    flex-direction: column;
    gap: 11px;
    min-width: 0;
  }

  .blh__feat-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .blh__accent-icon {
    color: var(--brand-accent);
  }

  .blh__feat-name {
    color: var(--foreground);
    font-weight: 700;
    font-size: 17px;
    line-height: 1.28;
    text-wrap: pretty;
  }

  .blh__feat-meta {
    color: var(--muted-foreground);
    font-weight: 500;
    font-size: 13.5px;
  }

  .blh__prices {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    margin-top: 2px;
  }

  .blh__price {
    color: var(--discount);
    font-weight: 800;
    font-size: 30px;
    white-space: nowrap;
  }

  .blh__price-old {
    color: var(--price-old);
    font-weight: 500;
    font-size: 15px;
    white-space: nowrap;
    text-decoration: line-through;
  }

  .blh__bonus {
    display: inline-flex;
    align-self: flex-start;
    align-items: center;
    gap: 8px;
    padding: 8px 13px;
    border-radius: 12px;
    background: linear-gradient(100deg, var(--bonus-surface), var(--bonus-surface-2));
    color: var(--bonus);
    font-weight: 700;
    font-size: 13px;
  }

  .blh__bonus-icon {
    color: var(--bonus-accent);
  }

  .blh__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }

  .blh__cta {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    padding: 0 24px;
    border: 1px solid rgb(255 255 255 / 0.45);
    border-radius: 999px;
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.9));
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      0 10px 24px rgb(43 127 255 / 0.3);
    cursor: pointer;
  }

  .blh__cta:hover {
    background: linear-gradient(150deg, rgb(90 158 255 / 1), rgb(21 93 252 / 0.95));
  }

  .blh__ghost {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    padding: 0 22px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.6));
    color: var(--foreground);
    font-weight: 600;
    font-size: 15px;
    box-shadow:
      inset 0 1px 0 #fff,
      0 6px 16px rgb(15 23 42 / 0.08);
  }

  .blh__ghost:hover {
    background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.7));
  }

  .blh__panel {
    display: flex;
    flex-direction: column;
    padding: 12px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 20px;
    background: rgb(255 255 255 / 0.72);
    box-shadow:
      inset 0 1px 0 #fff,
      0 10px 26px rgb(15 23 42 / 0.07);
    backdrop-filter: blur(12px) saturate(1.4);
    -webkit-backdrop-filter: blur(12px) saturate(1.4);
  }

  .blh__panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 2px 6px 10px;
  }

  .blh__panel-title {
    color: var(--foreground);
    font-weight: 800;
    font-size: 16px;
    letter-spacing: -0.015em;
  }

  .blh__panel-count {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--muted-foreground);
    font-weight: 600;
    font-size: 12.5px;
  }

  /* До широкого экрана коллекции едут лентой. */
  .blh__panel-list {
    display: flex;
    gap: 10px;
    overflow-x: auto;
    padding: 2px 2px 6px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;
  }

  .blh__panel-list::-webkit-scrollbar {
    display: none;
  }

  .blh__col {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 9px;
    width: 158px;
    padding: 9px;
    border: 1px solid transparent;
    border-radius: 18px;
    background: transparent;
    text-align: left;
    scroll-snap-align: start;
    cursor: pointer;
    transition: background 0.14s ease;
  }

  .blh__col:hover {
    background: rgb(15 23 42 / 0.035);
  }

  .blh__col--on {
    border-color: rgb(43 127 255 / 0.3);
    background: rgb(43 127 255 / 0.08);
  }

  .blh__col-thumb {
    width: 100%;
    height: 92px;
    border-radius: 12px;
    background: #f5f5f5 center / cover no-repeat;
    box-shadow: inset 0 0 0 1px rgb(15 23 42 / 0.09);
  }

  .blh__col-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .blh__col-name {
    overflow: hidden;
    color: var(--foreground);
    font-weight: 600;
    font-size: 13.5px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .blh__col-count {
    color: var(--muted-foreground);
    font-weight: 500;
    font-size: 12px;
  }

  /* Пустая коллекция — не серым: это приглашение, а не отсутствие данных. */
  .blh__col-count--empty {
    color: var(--primary);
  }

  .blh__col-chevron {
    display: none;
    flex: none;
    color: var(--muted-foreground);
  }

  @media (min-width: 760px) {
    .blh {
      gap: 20px;
      padding: 26px;
      border-radius: 30px;
    }

    .blh__brand {
      align-items: center;
      gap: 18px;
    }

    .blh__logo {
      width: 92px;
      height: 92px;
      padding: 12px;
      border-radius: 22px;
    }

    .blh__h1 {
      font-size: 52px;
    }

    .blh__lead {
      font-size: 15.5px;
    }

    .blh__trust {
      flex-wrap: wrap;
      overflow-x: visible;
    }

    .blh__split {
      gap: 20px;
    }

    .blh__feat {
      display: grid;
      grid-template-columns: minmax(280px, 0.92fr) minmax(0, 1.08fr);
      gap: 20px;
      align-items: center;
    }

    .blh__feat-img {
      aspect-ratio: 1 / 1;
      padding: 22px;
      border-radius: 24px;
    }

    .blh__feat-name {
      font-size: 20px;
    }

    .blh__price {
      font-size: 36px;
    }

    .blh__panel {
      padding: 14px;
      border-radius: 24px;
    }
  }

  @media (min-width: 1200px) {
    .blh {
      padding: 30px 32px;
    }

    .blh__all {
      display: inline-flex;
      flex: none;
      align-items: center;
      gap: 8px;
      height: 44px;
      padding: 0 18px;
      border: 1px solid rgb(255 255 255 / 0.9);
      border-radius: 999px;
      background: linear-gradient(150deg, #fff, rgb(224 233 247 / 0.6));
      color: var(--foreground);
      font-weight: 600;
      font-size: 14px;
      box-shadow:
        inset 0 1px 0 #fff,
        0 6px 16px rgb(15 23 42 / 0.08);
    }

    .blh__all:hover {
      background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.7));
    }

    .blh__split {
      display: grid;
      grid-template-columns: minmax(0, 1.5fr) minmax(300px, 1fr);
      gap: 22px;
      align-items: start;
    }

    .blh__feat {
      gap: 24px;
    }

    /* На широком экране коллекции становятся списком. */
    .blh__panel-list {
      flex-direction: column;
      gap: 2px;
      overflow-x: visible;
    }

    .blh__col {
      flex-direction: row;
      align-items: center;
      gap: 12px;
      width: 100%;
      padding: 8px 10px;
      border-radius: 16px;
    }

    .blh__col-thumb {
      flex: none;
      width: 64px;
      height: 46px;
    }

    .blh__col-chevron {
      display: block;
    }
  }
}
</style>
