<script setup lang="ts">
/**
 * Правая колонка шапки бренда: витрина одного товара. Порт второй половины
 * секции HERO из `Бренд.dc.html`.
 *
 * Что показывать, решает не редактор, а данные: берётся первый товар из уже
 * загруженной выдачи бренда. Отдельного поля «хит бренда» в базе нет, и
 * заводить его ради одной картинки — значит просить владельца поддерживать
 * ещё один список вручную. Порядок задаёт сортировка на странице: по
 * умолчанию «сначала новые», то есть в витрине окажется свежее поступление.
 *
 * Компонент молчит, если товара нет: у бренда без товаров пустая витрина
 * выглядела бы как ошибка загрузки.
 */
import type { ProductWithGallery } from '@/types'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const props = defineProps<{
  product?: ProductWithGallery | null
}>()

const emit = defineEmits<{ add: [product: ProductWithGallery] }>()

const { getVariantUrl } = useSupabaseStorage()

const imageUrl = computed(() => {
  const path = props.product?.product_images?.[0]?.image_url
  return path ? getVariantUrl(BUCKET_NAME_PRODUCT, path, 'md') : null
})

/*
 * Скидка считается от той же пары полей, что и в карточке товара:
 * `price` — до скидки, `final_price` — к оплате. Показываем, только если
 * разница есть, иначе «−0%» на пустом месте.
 */
const discount = computed(() => {
  const p = props.product
  if (!p?.price || !p.final_price || p.final_price >= p.price)
    return null
  return Math.round((1 - p.final_price / p.price) * 100)
})

const priceLabel = computed(() => {
  const value = props.product?.final_price ?? props.product?.price
  if (typeof value !== 'number')
    return null
  // `toLocaleString('ru-RU')` уже разделяет разряды неразрывным пробелом —
  // своя замена тут только вносила бы невидимый символ в исходник.
  return `${value.toLocaleString('ru-RU')} ₸`
})
</script>

<template>
  <div v-if="product" class="bhh">
    <NuxtLink :to="`/catalog/products/${product.slug}`" class="bhh__media">
      <img
        v-if="imageUrl"
        :src="imageUrl"
        :alt="product.name"
        class="bhh__img"
        loading="lazy"
        decoding="async"
      >
      <Icon v-else name="lucide:package" class="bhh__placeholder" />
    </NuxtLink>

    <span v-if="discount" class="bhh__discount">−{{ discount }}%</span>

    <div class="bhh__bar">
      <span class="bhh__info">
        <span class="bhh__caption">Хит бренда · {{ product.name }}</span>
        <span v-if="priceLabel" class="bhh__price">{{ priceLabel }}</span>
      </span>
      <button type="button" class="bhh__add" @click="emit('add', product)">
        В корзину
      </button>
    </div>
  </div>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .bhh {
    position: relative;
    min-height: 300px;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.8);
    border-radius: 28px;
    background: radial-gradient(120% 100% at 20% 0%, #e8f1ff 0%, #dbeafe 45%, #cfe3ff 100%);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.9),
      0 14px 34px rgb(15 23 42 / 0.09);
  }

  .bhh__media {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 26px;
  }

  .bhh__img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    /* Картинки товаров — PNG с белым фоном у части позиций; multiply сажает
       их на голубую подложку без видимой рамки. Здесь это безопасно:
       родитель не создаёт stacking context, в отличие от плиток категорий,
       где такой же приём молча не работал (см. CategoryTile.vue). */
    mix-blend-mode: multiply;
  }

  .bhh__placeholder {
    width: 64px;
    height: 64px;
    color: var(--primary);
    opacity: 0.35;
  }

  .bhh__discount {
    position: absolute;
    top: 18px;
    left: 18px;
    padding: 6px 13px;
    border-radius: 999px;
    background: var(--discount);
    color: #fff;
    font-weight: 800;
    font-size: 14px;
    box-shadow: 0 6px 16px rgb(231 0 11 / 0.28);
  }

  .bhh__bar {
    position: absolute;
    right: 18px;
    bottom: 18px;
    left: 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border: 1px solid rgb(255 255 255 / 0.9);
    border-radius: 20px;
    background: linear-gradient(150deg, rgb(255 255 255 / 0.9), rgb(255 255 255 / 0.62));
    backdrop-filter: blur(14px) saturate(1.6);
    -webkit-backdrop-filter: blur(14px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 #fff,
      0 8px 20px rgb(15 23 42 / 0.12);
  }

  .bhh__info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .bhh__caption {
    overflow: hidden;
    color: var(--muted-foreground);
    font-weight: 600;
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .bhh__price {
    color: var(--primary);
    font-weight: 800;
    font-size: 19px;
  }

  .bhh__add {
    flex: none;
    height: 44px;
    padding: 0 18px;
    border: none;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 8px 18px rgb(43 127 255 / 0.3);
    transition: background 0.15s ease;
  }

  .bhh__add:hover {
    background: var(--blue-700, #1d4ed8);
  }

  @media (min-width: 900px) {
    .bhh {
      min-height: 380px;
    }
  }
}
</style>
