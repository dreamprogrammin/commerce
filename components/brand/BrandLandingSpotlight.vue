<script setup lang="ts">
/**
 * Тёмная карточка «Хит продаж» — макет `Бренд LEGO.dc.html`, секция SPOTLIGHT.
 *
 * Один товар крупно на тёмной подложке: рейтинг, характеристики, цена, бонусы
 * и две кнопки. Секция сама прячется, если хвалить нечего.
 */
import type { ProductLine, ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
import { formatPrice } from '@/utils/formatPrice'

const props = defineProps<{
  products: ProductWithGallery[]
  lines: ProductLine[]
  lineByProduct: Record<string, string>
  /** Витрина шапки — её товар здесь не повторяем. */
  excludeId?: string | null
}>()

const { getVariantUrl } = useSupabaseStorage()
const cartStore = useCartStore()
const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const { flyToCart } = useCartFly()

// Ссылка — компонент, поэтому для полёта в корзину берётся её `$el`.
const imageRef = ref<{ $el?: HTMLElement } | HTMLElement | null>(null)
const imageEl = computed<HTMLElement | null>(() => {
  const node = imageRef.value as any
  return (node?.$el ?? node ?? null) as HTMLElement | null
})

/**
 * Хит — товар с лучшим отзывом. Отзывов может не быть вовсе, тогда берётся
 * самая большая скидка: это единственный признак «выгодно», который есть у
 * каждого товара.
 */
const hit = computed<ProductWithGallery | null>(() => {
  const pool = props.products.filter(p => p.id !== props.excludeId)
  if (pool.length === 0)
    return null

  const rated = pool
    .filter(p => (p.review_count ?? 0) > 0)
    .sort((a, b) =>
      (b.avg_rating ?? 0) - (a.avg_rating ?? 0)
      || (b.review_count ?? 0) - (a.review_count ?? 0),
    )
  if (rated.length > 0)
    return rated[0] ?? null

  const discounted = [...pool].sort(
    (a, b) => (b.discount_percentage ?? 0) - (a.discount_percentage ?? 0),
  )
  return (discounted[0]?.discount_percentage ?? 0) > 0 ? discounted[0] ?? null : null
})

const image = computed(() => {
  const path = hit.value?.product_images?.[0]?.image_url
  return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'md') : null
})

const price = computed(() => {
  const product = hit.value
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

const rating = computed(() => {
  const product = hit.value
  if (!product || !(product.review_count ?? 0))
    return null
  const count = product.review_count ?? 0
  const single = count % 10 === 1 && count % 100 !== 11
  const few = [2, 3, 4].includes(count % 10) && (count % 100 < 10 || count % 100 >= 20)
  // «1 отзыв покупателя», а не «покупателей»: склоняется и слово, и владелец.
  const label = single ? 'отзыв покупателя' : few ? 'отзыва покупателей' : 'отзывов покупателей'
  return {
    value: (product.avg_rating ?? 0).toFixed(1).replace('.', ','),
    label: `· ${count} ${label}`,
  }
})

const specs = computed(() => {
  const product = hit.value
  if (!product)
    return []

  const rows: { icon: string, label: string }[] = []
  const lineId = props.lineByProduct[product.id]
  const line = props.lines.find(l => l.id === lineId)
  if (line)
    rows.push({ icon: 'lucide:blocks', label: `Коллекция ${line.name}` })

  const min = (product as any).min_age_years as number | null
  const max = (product as any).max_age_years as number | null
  if (min != null)
    rows.push({ icon: 'lucide:cake', label: max ? `${min}–${max} лет` : `От ${min} лет` })

  if ((product.stock_quantity ?? 0) > 0)
    rows.push({ icon: 'lucide:package-check', label: 'В наличии в Алматы' })

  return rows
})

const isWished = computed(() =>
  hit.value ? wishlistStore.isProductInWishlist(hit.value.id) : false,
)

function addToCart(event: MouseEvent) {
  if (!hit.value)
    return
  flyToCart(imageEl.value, undefined, event.currentTarget as HTMLElement)
  cartStore.addItem(hit.value as any, 1)
}

async function toggleWish() {
  if (!hit.value)
    return
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal()
    return
  }
  await wishlistStore.toggleWishlist(hit.value.id, hit.value.name)
}
</script>

<template>
  <section v-if="hit && price" class="bls">
    <span class="bls__glow" aria-hidden="true" />

    <NuxtLink ref="imageRef" :to="`/catalog/products/${hit.slug}`" class="bls__img">
      <ProgressiveImage
        v-if="image"
        :src="image"
        :alt="hit.name"
        object-fit="contain"
        placeholder-type="shimmer"
        class="size-full"
      />
      <span v-if="price.discount" class="bls__discount">{{ price.discount }}</span>
    </NuxtLink>

    <div class="bls__body">
      <span class="bls__eyebrow">
        <Icon name="lucide:flame" class="size-4" />
        Хит продаж
      </span>

      <NuxtLink :to="`/catalog/products/${hit.slug}`" class="bls__name">
        {{ hit.name }}
      </NuxtLink>

      <span v-if="rating" class="bls__rating">
        <Icon name="gravity-ui:star-fill" class="bls__star size-4" />
        {{ rating.value }}
        <span class="bls__rating-note">{{ rating.label }}</span>
      </span>

      <div v-if="specs.length" class="bls__specs">
        <span v-for="spec in specs" :key="spec.label" class="bls__spec">
          <Icon :name="spec.icon" class="size-[15px]" />
          {{ spec.label }}
        </span>
      </div>

      <span class="bls__prices">
        <span class="bls__price">{{ formatPrice(price.final) }}&nbsp;₸</span>
        <span v-if="price.old" class="bls__price-old">
          {{ formatPrice(price.old) }}&nbsp;₸
        </span>
        <span v-if="price.bonus > 0" class="bls__bonus">
          <Icon name="lucide:gift" class="size-[15px]" />
          +{{ formatPrice(price.bonus) }} бонусов
        </span>
      </span>

      <div class="bls__actions">
        <button type="button" class="bls__cta" @click="addToCart">
          <Icon name="solar:cart-3-bold" class="size-[19px]" />
          В корзину
        </button>
        <button type="button" class="bls__wish" @click="toggleWish">
          <Icon
            :name="isWished ? 'line-md:heart-filled' : 'line-md:heart'"
            class="size-[19px]"
            mode="svg"
          />
          {{ isWished ? 'В избранном' : 'В избранное' }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bls {
    position: relative;
    display: grid;
    grid-template-columns: 1fr;
    gap: 18px;
    align-items: center;
    margin-top: 28px;
    padding: 18px;
    overflow: hidden;
    border-radius: 24px;
    background: linear-gradient(150deg, #0e1a33 0%, #17253f 55%, #0b1630 100%);
    box-shadow: 0 22px 50px rgb(9 17 35 / 0.34);
  }

  /* Тёплое пятно из макета: держит взгляд на фотографии. */
  .bls__glow {
    position: absolute;
    top: -45%;
    left: -12%;
    width: 62%;
    height: 190%;
    background: radial-gradient(circle at 50% 50%, var(--brand-glow), rgb(253 199 0 / 0) 70%);
    pointer-events: none;
  }

  .bls__img {
    position: relative;
    display: block;
    overflow: hidden;
    aspect-ratio: 1 / 1;
    padding: 18px;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 18px 40px rgb(0 0 0 / 0.3);
  }

  .bls__discount {
    position: absolute;
    top: 14px;
    left: 14px;
    padding: 6px 13px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
  }

  .bls__body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 13px;
    min-width: 0;
  }

  .bls__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--brand-on-dark);
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .bls__name {
    color: #fff;
    font-weight: 800;
    font-size: 21px;
    line-height: 1.24;
    letter-spacing: -0.02em;
    text-wrap: pretty;
  }

  .bls__rating {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #fff;
    font-weight: 700;
    font-size: 13.5px;
  }

  .bls__star {
    color: var(--rating, #fdc700);
  }

  .bls__rating-note {
    color: rgb(255 255 255 / 0.72);
    font-weight: 500;
  }

  .bls__specs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 2px;
  }

  .bls__spec {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 34px;
    padding: 0 14px;
    border: 1px solid rgb(255 255 255 / 0.2);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.09);
    color: #eaf0fb;
    font-weight: 600;
    font-size: 12.5px;
  }

  .bls__prices {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
    margin-top: 4px;
  }

  .bls__price {
    color: #fff;
    font-weight: 800;
    font-size: 30px;
    white-space: nowrap;
  }

  .bls__price-old {
    color: rgb(255 255 255 / 0.72);
    font-weight: 500;
    font-size: 15px;
    white-space: nowrap;
    text-decoration: line-through;
  }

  .bls__bonus {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 7px 12px;
    border: 1px solid rgb(253 199 0 / 0.3);
    border-radius: 11px;
    background: rgb(253 199 0 / 0.14);
    color: #ffd84d;
    font-weight: 700;
    font-size: 13px;
    white-space: nowrap;
  }

  .bls__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 6px;
  }

  .bls__cta {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    padding: 0 24px;
    border: none;
    border-radius: 999px;
    background: #fff;
    color: #0e1a33;
    font-weight: 700;
    font-size: 15px;
    box-shadow: 0 12px 26px rgb(0 0 0 / 0.28);
    cursor: pointer;
  }

  .bls__cta:hover {
    background: #f1f5fd;
  }

  .bls__wish {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    height: 52px;
    padding: 0 20px;
    border: 1px solid rgb(255 255 255 / 0.35);
    border-radius: 999px;
    background: rgb(255 255 255 / 0.07);
    color: #fff;
    font-weight: 600;
    font-size: 15px;
    cursor: pointer;
  }

  .bls__wish:hover {
    background: rgb(255 255 255 / 0.14);
  }

  @media (min-width: 760px) {
    .bls {
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: 30px;
      margin-top: 44px;
      padding: 30px;
      border-radius: 30px;
    }

    .bls__img {
      border-radius: 24px;
    }

    .bls__name {
      font-size: 30px;
    }

    .bls__price {
      font-size: 38px;
    }
  }
}
</style>
