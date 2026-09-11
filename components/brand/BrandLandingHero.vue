<script setup lang="ts">
/**
 * Шапка лендинга бренда — макет `Бренд LEGO.dc.html`, секция HERO.
 *
 * Тёмная полоса во всю ширину: логотип, имя, лид, четыре цифры о бренде и
 * полоса доверия; справа белая карточка флагманского товара с ценой и
 * кнопкой. Свечение подложки задаёт цвет бренда (`--brand-glow`).
 *
 * Коллекции живут отдельной секцией ниже — в шапке их нет.
 */
import type { Brand, ProductLine, ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_BRANDS, BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice } from '@/utils/formatPrice'
import { pluralRu } from '@/utils/seoDescription'

const props = defineProps<{
  brand: Brand
  /** Товары бренда — первый идёт витриной. */
  products: ProductWithGallery[]
  lines: ProductLine[]
  /** Раздел каталога, где лежат товары бренда: «Конструкторы», «Куклы». */
  topCategory?: string | null
}>()

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

const heroImage = computed(() => {
  const path = hero.value?.product_images?.[0]?.image_url
  return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'md') : null
})

/**
 * Надстрочник в шапке — строка НАД именем бренда, по макету.
 *
 * Он же первая половина заголовка страницы: `<h1>` читается как
 * «Конструкторы LEGO», а выглядит ровно как в макете — мелкая строка
 * раздела и крупное имя. Голое «LEGO» в H1 не содержало ни слова о том, что
 * продаётся, и страница висела на 28-й позиции по «лего алматы купить».
 *
 * Страна и год основания живут в `brands.facts`, пустых у всех 32 брендов.
 * Они идут в надстрочник, только когда раздел неизвестен: смешивать их с
 * названием раздела внутри H1 нельзя, заголовок превратится в кашу. Сами
 * факты и так показываются в карточке «Коротко о бренде».
 */
const eyebrow = computed(() => {
  if (props.topCategory)
    return props.topCategory

  const facts = props.brand.facts ?? []
  const value = (key: string) =>
    facts.find(f => f?.k?.toLowerCase().startsWith(key))?.v?.trim()

  const country = value('стран')
  const founded = value('основан')

  return [country, founded && `с ${founded.replace(/\s*год\w*$/i, '')} года`]
    .filter(Boolean)
    .join(' · ')
})

const lead = computed(() => props.brand.seo_description || '')

const inStockCount = computed(
  () => props.products.filter(p => (p.stock_quantity ?? 0) > 0).length,
)

/** Возрастной охват бренда — по крайним границам его товаров. */
const ageSpan = computed(() => {
  const mins = props.products
    .map(p => (p as any).min_age_years as number | null)
    .filter((n): n is number => n != null)
  if (mins.length === 0)
    return ''

  const maxs = props.products
    .map(p => (p as any).max_age_years as number | null)
    .filter((n): n is number => n != null)
  const from = Math.min(...mins)
  const to = maxs.length ? Math.max(...maxs) : null
  return to ? `От ${from} до ${to} лет` : `От ${from} лет`
})

/*
 * Четыре цифры макета. Первые две считаются по выдаче, вторые — условия
 * магазина, они одинаковы для всех брендов и уже стоят в полосе доверия.
 */
const stats = computed(() => {
  const rows = [
    {
      num: String(inStockCount.value),
      label: `${pluralRu(inStockCount.value, 'товар', 'товара', 'товаров')} в наличии`,
    },
  ]

  if (props.lines.length > 0) {
    rows.push({
      num: String(props.lines.length),
      label: pluralRu(props.lines.length, 'коллекция', 'коллекции', 'коллекций'),
    })
  }

  rows.push(
    { num: '1–2 дня', label: 'доставка по КЗ' },
    { num: '1 = 1 ₸', label: 'бонусы за покупку' },
  )

  return rows
})

const tags = computed(() =>
  [
    { icon: 'lucide:shield-check', label: 'Оригинал и сертификаты', color: '#4ade80' },
    ageSpan.value && { icon: 'lucide:cake', label: ageSpan.value, color: '#ffd84d' },
    { icon: 'lucide:package-check', label: 'Отправка из Алматы', color: '#8ec2ff' },
  ].filter(Boolean) as { icon: string, label: string, color: string }[],
)

const heroPrice = computed(() => {
  const product = hero.value
  if (!product)
    return null
  return {
    final: product.final_price ?? product.price,
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
    <span class="blh__aura" aria-hidden="true" />

    <div class="blh__grid">
      <div class="blh__left">
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

          <h1 class="blh__title">
            <span v-if="eyebrow" class="blh__eyebrow">{{ eyebrow }}</span>
            <span class="blh__h1">{{ brand.seo_h1 || brand.name }}</span>
          </h1>
        </div>

        <p v-if="lead" class="blh__lead">
          {{ lead }}
        </p>

        <div class="blh__stats">
          <span v-for="stat in stats" :key="stat.label" class="blh__stat">
            <span class="blh__stat-num">{{ stat.num }}</span>
            <span class="blh__stat-label">{{ stat.label }}</span>
          </span>
        </div>

        <div class="blh__tags">
          <span v-for="tag in tags" :key="tag.label" class="blh__tag">
            <Icon :name="tag.icon" class="size-[14px]" :style="{ color: tag.color }" />
            {{ tag.label }}
          </span>
        </div>
      </div>

      <!-- Витрина флагмана -->
      <div v-if="hero && heroPrice" class="blh__flag">
        <span class="blh__flag-eyebrow">Флагман бренда</span>

        <NuxtLink
          ref="heroImageRef"
          :to="`/catalog/products/${hero.slug}`"
          class="blh__flag-img"
        >
          <!-- `!bg-transparent`: серая подложка ProgressiveImage при
               object-fit: contain вылезает полями по бокам и рисует
               прямоугольник поверх подложки карточки. Тот же приём — в
               галерее товара. -->
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

        <NuxtLink :to="`/catalog/products/${hero.slug}`" class="blh__flag-name">
          {{ hero.name }}
        </NuxtLink>

        <span class="blh__prices">
          <span class="blh__price">{{ formatPrice(heroPrice.final) }}&nbsp;₸</span>
          <span v-if="heroPrice.old" class="blh__price-old">
            {{ formatPrice(heroPrice.old) }}&nbsp;₸
          </span>
          <span v-if="heroPrice.bonus > 0" class="blh__bonus">
            <Icon name="lucide:gift" class="size-[14px] blh__bonus-icon" />
            +{{ formatPrice(heroPrice.bonus) }} бонусов
          </span>
        </span>

        <div class="blh__actions">
          <button type="button" class="blh__cta" @click="addHeroToCart">
            <Icon name="solar:cart-3-bold" class="size-[19px]" />
            В корзину
          </button>
          <NuxtLink
            :to="`/catalog/products/${hero.slug}`"
            class="blh__more"
            aria-label="Подробнее о товаре"
          >
            <Icon name="lucide:arrow-right" class="size-[19px] text-primary" />
          </NuxtLink>
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
    padding: 22px 18px;
    border-radius: 24px;
    background: linear-gradient(146deg, #0d1830 0%, #152a4d 52%, #0a142b 100%);
    box-shadow: 0 22px 50px rgb(9 17 35 / 0.3);
    overflow: hidden;
  }

  /* Свечение в цвет бренда — единственное цветное пятно на тёмной полосе. */
  .blh__aura {
    position: absolute;
    top: -38%;
    left: 50%;
    width: 150%;
    height: 78%;
    transform: translateX(-50%);
    background: radial-gradient(closest-side at 50% 50%, var(--brand-glow) 0%, rgb(0 0 0 / 0) 100%);
    pointer-events: none;
  }

  .blh__grid {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .blh__left {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }

  .blh__brand {
    display: flex;
    align-items: center;
    gap: 14px;
    min-width: 0;
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
    flex-direction: column;
    gap: 4px;
    margin: 0;
    min-width: 0;
  }

  .blh__eyebrow {
    color: #ffd84d;
    font-weight: 700;
    font-size: 11.5px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }

  .blh__h1 {
    display: block;
    color: #fff;
    font-weight: 800;
    font-size: 38px;
    line-height: 0.95;
    letter-spacing: -0.035em;
  }

  .blh__lead {
    margin: 0;
    max-width: 42ch;
    color: rgb(255 255 255 / 0.78);
    font-size: 14px;
    line-height: 1.6;
    text-wrap: pretty;
  }

  .blh__stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 9px;
  }

  .blh__stat {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 12px 14px;
    border: 1px solid rgb(255 255 255 / 0.14);
    border-radius: 16px;
    background: rgb(255 255 255 / 0.07);
  }

  .blh__stat-num {
    color: #fff;
    font-weight: 800;
    font-size: 20px;
    letter-spacing: -0.02em;
  }

  .blh__stat-label {
    color: rgb(255 255 255 / 0.66);
    font-weight: 500;
    font-size: 12px;
  }

  .blh__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
  }

  .blh__tag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 13px;
    border: 1px solid rgb(255 255 255 / 0.16);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.09);
    color: #e9f0fb;
    font-weight: 600;
    font-size: 12.5px;
  }

  .blh__flag {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px;
    border-radius: 20px;
    background: var(--card);
    box-shadow: 0 18px 40px rgb(6 12 26 / 0.34);
  }

  .blh__flag-eyebrow {
    color: var(--muted-foreground);
    font-weight: 700;
    font-size: 11.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .blh__flag-img {
    position: relative;
    display: block;
    border-radius: 16px;
    background: linear-gradient(158deg, #f7f9fc, #eaf0f8);
    aspect-ratio: 4 / 3;
    overflow: hidden;
  }

  .blh__flag-img :deep(img) {
    padding: 18px;
  }

  .blh__discount {
    position: absolute;
    top: 12px;
    left: 12px;
    padding: 5px 12px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 13px;
  }

  .blh__flag-name {
    display: -webkit-box;
    color: var(--foreground);
    font-weight: 600;
    font-size: 15px;
    line-height: 1.35;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
  }

  .blh__prices {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 10px;
  }

  .blh__price {
    color: var(--discount);
    font-weight: 800;
    font-size: 28px;
  }

  .blh__price-old {
    color: var(--price-old);
    font-weight: 500;
    font-size: 14px;
    text-decoration: line-through;
  }

  .blh__bonus {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 10px;
    background: var(--bonus-surface);
    color: var(--bonus);
    font-weight: 700;
    font-size: 12px;
  }

  .blh__bonus-icon {
    color: var(--bonus-accent);
  }

  .blh__actions {
    display: flex;
    gap: 9px;
    margin-top: 2px;
  }

  .blh__cta {
    display: inline-flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    gap: 9px;
    min-width: 0;
    height: 50px;
    padding: 0 18px;
    border-radius: 999px;
    background: linear-gradient(150deg, rgb(77 148 255 / 0.98), rgb(23 101 235 / 0.94));
    box-shadow: 0 10px 22px rgb(43 127 255 / 0.28);
    color: #fff;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
  }

  .blh__cta:hover {
    background: linear-gradient(150deg, rgb(90 158 255 / 1), rgb(21 93 252 / 0.98));
  }

  .blh__more {
    display: grid;
    flex: none;
    place-content: center;
    width: 50px;
    height: 50px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--card);
  }

  .blh__more:hover {
    background: var(--muted);
  }

  @media (min-width: 760px) {
    .blh {
      padding: 28px;
      border-radius: 30px;
    }

    .blh__aura {
      top: -46%;
      left: -6%;
      width: 66%;
      height: 180%;
      transform: none;
    }

    .blh__grid {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(280px, 0.85fr);
      gap: 24px;
      align-items: center;
    }

    .blh__left {
      gap: 20px;
    }

    .blh__h1 {
      font-size: 52px;
    }

    .blh__lead {
      font-size: 15.5px;
    }

    .blh__logo {
      width: 92px;
      height: 92px;
      padding: 12px;
      border-radius: 22px;
    }

    .blh__stats {
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }

    .blh__stat-num {
      font-size: 23px;
    }

    .blh__flag {
      gap: 10px;
      padding: 18px;
      border-radius: 24px;
    }

    .blh__flag-img {
      border-radius: 18px;
      aspect-ratio: 1 / 1;
    }

    .blh__flag-img :deep(img) {
      padding: 22px;
    }

    .blh__flag-name {
      font-size: 16px;
    }

    .blh__price {
      font-size: 32px;
    }
  }

  @media (min-width: 1200px) {
    .blh {
      padding: 34px 36px;
    }

    .blh__grid {
      grid-template-columns: minmax(0, 1.15fr) minmax(330px, 0.85fr);
      gap: 34px;
    }
  }
}
</style>
