<script setup lang="ts">
import type { BaseProduct, FullProduct } from '@/types'
import { storeToRefs } from 'pinia'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

/**
 * «Товар дня» — стеклянная карточка (Homepage.dc.html: product of the day).
 *
 * Сам товар РЕАЛЬНЫЙ (productsStore.fetchFeaturedProducts(1)). Фабрикуется
 * только дедлайн: обратный отсчёт до конца локальных суток (см. плейсхолдер
 * DEAL_COUNTDOWN_MODE в constants/homePlaceholders.ts). На сервере отсчёт не
 * рисуем, чтобы не ловить hydration mismatch по времени.
 */
const productsStore = useProductsStore()
const cartStore = useCartStore()
const { getVariantUrl } = useSupabaseStorage()
const { items } = storeToRefs(cartStore)

/*
 * Товар берётся на сервере, а не в onMounted.
 *
 * Данные тут ничьи персонально — обычная публичная выборка is_featured, — а
 * из-за onMounted карточка появлялась только на 7372 мс и растила блок «Акции
 * и бонусы» с 262 до 508px, толкая вниз всё, что ниже. Замер на стенде
 * (390px, Slow 4G, CPU ×4).
 */
const { data: product } = await useAsyncData(
  'home-deal-of-the-day',
  async () => {
    const featured = await productsStore.fetchFeaturedProducts(1)
    return (featured?.[0] ?? null) as FullProduct | null
  },
  { default: () => null },
)

const line = computed(() =>
  product.value?.product_lines?.name
  ?? product.value?.categories?.name
  ?? '',
)

const imageUrl = computed(() => {
  const raw = product.value?.product_images?.[0]?.image_url
  if (!raw)
    return null
  if (raw.startsWith('http'))
    return raw
  return getVariantUrl(BUCKET_NAME_PRODUCT, raw, 'sm') || null
})

const priceNow = computed(() => product.value?.final_price ?? 0)
const priceOld = computed(() => {
  const p = product.value
  if (!p)
    return null
  // price — «старая» цена, final_price — текущая (old_price-колонки нет).
  return p.price > p.final_price ? p.price : null
})

function fmt(n: number): string {
  return n.toLocaleString('ru-KZ')
}

const qty = computed(() => {
  const id = product.value?.id
  if (!id)
    return 0
  return items.value.find(i => i.product.id === id)?.quantity ?? 0
})

function addOne() {
  if (product.value)
    cartStore.addItem(product.value, 1)
}

// --- обратный отсчёт до конца суток ---
/*
 * Заглушка, а не пустая строка: при `v-if="countdown"` таймер не рисовался на
 * сервере и появлялся только на гидрации, добавляя карточке 14px. Настоящее
 * значение на сервере не годится — главная лежит в ISR-кеше, и оттуда приехало
 * бы время многочасовой давности.
 */
const countdown = ref('--:--:--')
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  const now = new Date()
  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  )
  let diff = Math.max(0, Math.floor((end.getTime() - now.getTime()) / 1000))
  const h = Math.floor(diff / 3600)
  diff %= 3600
  const m = Math.floor(diff / 60)
  const s = diff % 60
  const pad = (v: number) => String(v).padStart(2, '0')
  countdown.value = `${pad(h)}:${pad(m)}:${pad(s)}`
}

/*
 * Отсчёт останавливается на время ухода со страницы: главная удерживается в
 * памяти, поэтому onUnmounted при переходе не вызывается, и секундный таймер
 * иначе тикал бы, пока человек ходит по другим страницам.
 */
useResumableEffect(
  () => {
    tick()
    timer = setInterval(tick, 1000)
  },
  () => {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  },
)
</script>

<template>
  <div v-if="product" class="deal">
    <span class="deal__glow deal__glow--1" />
    <span class="deal__glow deal__glow--2" />
    <span class="deal__frost" />
    <span class="deal__sheen" />

    <div class="deal__head">
      <span class="deal__tag">
        <Icon name="lucide:flame" class="size-[18px] text-[color:var(--color-orange-600)]" />
        Товар дня
      </span>
      <span v-if="countdown" class="deal__timer">
        <Icon name="lucide:clock" class="size-[13px]" />
        {{ countdown }}
      </span>
    </div>

    <NuxtLink :to="`/catalog/products/${product.slug}`" class="deal__body">
      <span class="deal__img">
        <img v-if="imageUrl" :src="imageUrl" :alt="product.name" loading="lazy">
      </span>
      <div class="deal__info">
        <span v-if="line" class="deal__line">{{ line }}</span>
        <b class="deal__name">{{ product.name }}</b>
        <div class="deal__buy" @click.prevent>
          <span class="deal__price">
            <span v-if="priceOld" class="deal__price-old">{{ fmt(priceOld) }}&nbsp;₸</span>
            <span class="deal__price-now">{{ fmt(priceNow) }}&nbsp;₸</span>
          </span>
          <ClientOnly>
            <QuantitySelector
              v-if="qty > 0"
              :product="(product as unknown as BaseProduct)"
              :quantity="qty"
            />
            <button
              v-else
              type="button"
              class="deal__add"
              aria-label="В корзину"
              @click="addOne"
            >
              <Icon name="lucide:plus" class="size-[22px]" />
            </button>
          </ClientOnly>
        </div>
      </div>
    </NuxtLink>
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
  .deal {
    position: relative;
    display: flex;
    flex-direction: column;
    border-radius: 24px;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.7);
    box-shadow:
      0 22px 48px -24px rgb(15 23 42 / 0.45),
      inset 0 1px 0 rgb(255 255 255 / 0.9),
      inset 0 -1px 1px rgb(255 255 255 / 0.35);
    background: linear-gradient(150deg, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.28));
  }

  .deal__glow {
    position: absolute;
    border-radius: 50%;
    pointer-events: none;
  }

  .deal__glow--1 {
    top: -54px;
    left: -34px;
    width: 210px;
    height: 210px;
    background: radial-gradient(circle, rgb(255 150 60 / 0.9), transparent 68%);
    filter: blur(34px);
  }

  .deal__glow--2 {
    bottom: -64px;
    right: -24px;
    width: 230px;
    height: 230px;
    background: radial-gradient(circle, rgb(70 140 255 / 0.8), transparent 68%);
    filter: blur(40px);
  }

  .deal__frost {
    position: absolute;
    inset: 0;
    background: rgb(255 255 255 / 0.44);
    -webkit-backdrop-filter: blur(22px) saturate(1.7);
    backdrop-filter: blur(22px) saturate(1.7);
    pointer-events: none;
  }

  .deal__sheen {
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, rgb(255 255 255 / 0.7) 0%, rgb(255 255 255 / 0) 34%);
    pointer-events: none;
  }

  .deal__head {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 15px 18px;
    border-bottom: 1px solid rgb(255 255 255 / 0.5);
  }

  .deal__tag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-weight: 700;
    font-size: 15px;
    color: var(--foreground);
  }

  .deal__timer {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgb(220 38 38 / 0.92);
    color: #fff;
    border-radius: 999px;
    padding: 6px 11px;
    font-weight: 700;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    box-shadow: 0 4px 12px -4px rgb(220 38 38 / 0.6);
  }

  .deal__body {
    position: relative;
    display: flex;
    gap: 16px;
    padding: 18px;
    flex: 1;
    text-decoration: none;
    color: inherit;
  }

  .deal__img {
    flex: 0 0 auto;
    width: 116px;
    height: 116px;
    border-radius: 16px;
    background: #fff;
    border: 1px solid var(--border);
    display: grid;
    place-items: center;
    overflow: hidden;
    padding: 6px;
  }

  .deal__img img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .deal__info {
    display: flex;
    flex-direction: column;
    gap: 9px;
    min-width: 0;
  }

  .deal__line {
    font-weight: 600;
    font-size: 11px;
    color: var(--product-line);
  }

  .deal__name {
    font-weight: 600;
    font-size: 14px;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .deal__buy {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .deal__price {
    display: flex;
    flex-direction: column;
    line-height: 1.1;
  }

  .deal__price-old {
    font-weight: 500;
    font-size: 12px;
    color: var(--price-old);
    text-decoration: line-through;
  }

  .deal__price-now {
    font-weight: 800;
    font-size: 20px;
    color: var(--foreground);
  }

  .deal__add {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: #fff;
    color: var(--primary);
    cursor: pointer;
    display: grid;
    place-content: center;
    flex: none;
    transition:
      border-color 0.15s ease,
      background 0.15s ease;
  }

  .deal__add:hover {
    border-color: var(--primary);
    background: var(--brand-surface);
  }
}
</style>
