<script setup lang="ts">
import type { BaseProduct } from '@/types'
import { computed, ref } from 'vue'
import StockAlertButton from '@/components/product/StockAlertButton.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useSeoAltText } from '@/composables/useSeoAltText'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useAuthStore } from '@/stores/auth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
import { formatPrice } from '@/utils/formatPrice'

const props = withDefaults(defineProps<{
  product: BaseProduct
  /**
   * Позиция карточки в сетке. Нужна ровно для одного: решить, грузить ли
   * первый кадр галереи сразу.
   *
   * Раньше `eager` стоял у первого кадра КАЖДОЙ карточки, то есть у всех
   * двенадцати на странице, и каждая уходила в сеть с `fetchpriority="high"`.
   * Замер категории на Slow 4G: до момента LCP скачивается 608 КБ, из них
   * 162 КБ — эти самые двенадцать картинок. Они отбирают канал у CSS, без
   * которого не красится вообще ничего: FCP приходил на 4.9 с.
   *
   * По умолчанию 99 — то есть карточка вне сетки (похожие товары, слайдеры)
   * ведёт себя как раньше: ленивая загрузка, без высокого приоритета.
   *
   * Имя `position`, а не `index`: внутри шаблона `index` уже занят счётчиком
   * кадров галереи, и одноимённый проп его затенял бы.
   */
  position?: number
}>(), {
  position: 99,
})

/*
 * Сколько карточек считаем «над сгибом». На 390px сетка в две колонки,
 * высота карточки ~330px при экране 844 — видно две строки. На десктопе
 * четыре колонки, то есть первая строка целиком. Четыре покрывает оба
 * случая; остальные догрузятся лениво, когда до них доскроллят.
 */
const EAGER_CARDS = 4
const isAboveTheFold = computed(() => props.position < EAGER_CARDS)

const cartStore = useCartStore()
const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const { getImageUrl, getVariantUrl } = useSupabaseStorage()
const { triggerHaptic } = useHaptic()
const { generateProductImageAlt } = useSeoAltText()

// --- ГАЛЕРЕЯ: единая scroll-snap лента (нативный свайп на тач, наведение мышью на десктопе) ---
const scrollerRef = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

const galleryImages = computed(() => props.product.product_images ?? [])
const hasMultipleImages = computed(() => galleryImages.value.length > 1)

/**
 * Индексы слайдов, для которых уже рендерим настоящую картинку (соседние тоже).
 * Остальные — скелетон, чтобы не грузить всю галерею разом.
 */
const visitedSlideIndexes = ref<Set<number>>(new Set([0]))

function markVisited(index: number) {
  visitedSlideIndexes.value.add(index)
  if (index - 1 >= 0)
    visitedSlideIndexes.value.add(index - 1)
  if (index + 1 < galleryImages.value.length)
    visitedSlideIndexes.value.add(index + 1)
}

function onScroll(e: Event) {
  const el = e.currentTarget as HTMLElement
  if (!el || !el.clientWidth)
    return

  const index = Math.round(el.scrollLeft / el.clientWidth)
  if (index !== activeIndex.value) {
    activeIndex.value = index
  }
  markVisited(index)
}

/**
 * Дэстоп: позиция курсора над картинкой напрямую управляет слайдом —
 * ширина делится на количество фото, без клика и перетаскивания (как в WB/Ozon).
 */
function onGalleryMouseMove(e: MouseEvent) {
  const el = scrollerRef.value
  if (!el || !hasMultipleImages.value)
    return

  const rect = el.getBoundingClientRect()
  if (!rect.width)
    return

  const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 0.999)
  const index = Math.floor(ratio * galleryImages.value.length)

  markVisited(index)
  if (index !== activeIndex.value) {
    activeIndex.value = index
  }
  el.scrollLeft = index * el.clientWidth
}

function onGalleryMouseLeave() {
  const el = scrollerRef.value
  if (!el || !hasMultipleImages.value)
    return

  activeIndex.value = 0
  el.scrollLeft = 0
}

function getImageUrlByIndex(index: number): string | null {
  const imageUrl = galleryImages.value[index]?.image_url
  if (!imageUrl)
    return null

  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.CARD)
}

function getVariantUrls(index: number) {
  const imageUrl = galleryImages.value[index]?.image_url
  if (!imageUrl)
    return {}
  return {
    sm: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'sm'),
    md: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'md'),
    lg: getVariantUrl(BUCKET_NAME_PRODUCT, imageUrl, 'lg'),
  }
}

function getImageAlt(index: number): string {
  const totalImages = galleryImages.value.length || 1

  return generateProductImageAlt({
    productName: props.product.name,
    brandName: props.product.brands?.name,
    lineName: props.product.product_line_name,
    index,
    totalImages,
  })
}

// --- ЦЕНА ---
const priceDetails = computed(() => {
  const originalPrice = Number(props.product.price)
  const discountPercent = Number(props.product.discount_percentage)
  const hasDiscount = discountPercent > 0 && discountPercent <= 100

  // 🔥 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: final_price из базы данных (generated column,
  // применяет психологическое округление)
  const finalPrice = hasDiscount && props.product.final_price
    ? Number(props.product.final_price)
    : originalPrice

  return {
    hasDiscount,
    finalPrice,
    originalPrice,
    percent: hasDiscount ? Math.round(discountPercent) : 0,
  }
})

const ratingLabel = computed(() => {
  const rating = props.product.avg_rating
  return rating != null ? rating.toFixed(1).replace('.', ',') : ''
})

const bonusLabel = computed(() => `+${formatPrice(props.product.bonus_points_award || 0)} бонусов`)

const hasRating = computed(() =>
  Boolean(props.product.review_count && props.product.review_count > 0 && props.product.avg_rating),
)

const hasBonus = computed(() =>
  Boolean(props.product.bonus_points_award && props.product.bonus_points_award > 0),
)

const inStock = computed(() => Boolean(props.product.stock_quantity && props.product.stock_quantity > 0))

// --- КОРЗИНА ---
const itemInCart = computed(() => cartStore.items.find(item => item.product.id === props.product.id))
const quantityInCart = computed(() => itemInCart.value?.quantity ?? 0)
const maxAvailableQuantity = computed(() => Math.max(1, Math.floor((props.product.stock_quantity || 0) * 0.8)))

function onAdd() {
  // Событие add_to_cart отправляет сам `cartStore.addItem` — раньше оно
  // висело здесь, и потому считались только добавления из карточки в списке.
  cartStore.addItem(props.product as BaseProduct, 1)
  triggerHaptic('medium')
}

function onInc() {
  const next = quantityInCart.value + 1
  if (next > maxAvailableQuantity.value)
    return
  cartStore.updateQuantity(props.product.id, next)
  triggerHaptic('light')
}

function onDec() {
  const next = quantityInCart.value - 1
  // remove_from_cart отправляет сам стор: `updateQuantity` при нуле зовёт
  // `removeItem`, а тот и шлёт событие.
  cartStore.updateQuantity(props.product.id, next)
  triggerHaptic('light')
}

// --- ИЗБРАННОЕ ---
const isWishlisted = computed(() => wishlistStore.isProductInWishlist(props.product.id))

async function onWish() {
  if (!authStore.isLoggedIn) {
    modalStore.openLoginModal()
    return
  }
  await wishlistStore.toggleWishlist(props.product.id, props.product.name)
}
</script>

<template>
  <div
    class="pc-card flex h-full flex-col rounded-[20px] bg-white p-2.5"
    :class="quantityInCart > 0 ? 'pc-card--active' : ''"
  >
    <!-- 🖼️ ГАЛЕРЕЯ ИЗОБРАЖЕНИЙ -->
    <div class="relative aspect-square overflow-hidden rounded-xl bg-white">
      <NuxtLink
        :to="`/catalog/products/${product.slug}`"
        class="absolute inset-0 block"
      >
        <div
          v-if="galleryImages.length"
          ref="scrollerRef"
          class="pc-scroll flex h-full w-full select-none overflow-x-auto overflow-y-hidden [scroll-snap-type:x_mandatory] [touch-action:pan-x]"
          @scroll="onScroll"
          @mousemove="onGalleryMouseMove"
          @mouseleave="onGalleryMouseLeave"
        >
          <div
            v-for="(image, index) in galleryImages"
            :key="`slide-${index}`"
            class="h-full w-full shrink-0 [scroll-snap-align:center]"
          >
            <ProgressiveImage
              v-if="visitedSlideIndexes.has(index)"
              :src="getImageUrlByIndex(index)"
              :src-sm="getVariantUrls(index).sm"
              :src-md="getVariantUrls(index).md"
              :src-lg="getVariantUrls(index).lg"
              sizes="(max-width: 767px) 50vw, (max-width: 1024px) 33vw, 25vw"
              :alt="getImageAlt(index)"
              aspect-ratio="square"
              object-fit="contain"
              placeholder-type="lqip"
              :blur-data-url="image.blur_placeholder"
              :eager="index === 0 && isAboveTheFold"
            />
            <!-- Подложка непосещённого слайда — БЕЗ animate-pulse.
                 Пульсация означает «идёт загрузка», а здесь ничего не грузится:
                 слайд просто не запрошен, пока по нему не провели. Посетитель
                 листает карточки редко, поэтому такие подложки жили на странице
                 вечно и всё это время анимировались. Замер на главной: 91 штука
                 в непрерывной анимации и на 3-й секунде, и на 12-й — счётчик
                 не менялся вовсе. Статичная плашка держит ту же геометрию. -->
            <div v-else class="h-full w-full bg-muted" aria-hidden="true" />
          </div>
        </div>

        <div v-else class="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
          📷 Нет фото
        </div>
      </NuxtLink>

      <!-- 🆕 Новинка -->
      <Badge
        v-if="product.is_new"
        variant="secondary"
        class="pointer-events-none absolute left-2.5 top-2.5 z-10 rounded-full border-transparent bg-success px-2.5 py-1 text-[11.5px] font-bold text-white shadow-lg"
      >
        Новинка
      </Badge>

      <!-- 🏷️ Скидка -->
      <Badge
        v-if="priceDetails.hasDiscount"
        variant="destructive"
        class="pointer-events-none absolute bottom-2.5 left-2.5 z-10 rounded-full px-[11px] py-[5px] text-[13px] font-extrabold shadow-lg"
      >
        −{{ priceDetails.percent }}%
      </Badge>

      <!-- ❤️ Избранное -->
      <button
        type="button"
        aria-label="В избранное"
        class="pc-wish absolute right-2 top-2 z-[3] grid size-[38px] place-content-center rounded-full"
        @click.stop.prevent="onWish"
      >
        <Icon
          :name="isWishlisted ? 'line-md:heart-filled' : 'line-md:heart'"
          class="size-[21px]"
          :class="isWishlisted ? 'text-red-500' : 'text-muted-foreground'"
        />
      </button>

      <!-- 🔵 Индикаторы -->
      <div
        v-if="hasMultipleImages"
        class="pointer-events-none absolute inset-x-0 bottom-[9px] z-[2] flex items-center justify-center gap-[5px]"
      >
        <span
          v-for="(_, index) in galleryImages"
          :key="`dot-${index}`"
          class="h-1.5 rounded-full shadow-[0_1px_3px_rgb(0_0_0_/_0.3)] transition-[width] duration-200"
          :class="index === activeIndex ? 'w-4 bg-white' : 'w-1.5 bg-white/60'"
        />
      </div>
    </div>

    <!-- 📋 ИНФОРМАЦИЯ О ТОВАРЕ -->
    <div class="flex flex-1 flex-col gap-[7px] px-[5px] pb-[3px] pt-[11px]">
      <!-- 📝 Название -->
      <NuxtLink :to="`/catalog/products/${product.slug}`" class="block">
        <h3 class="line-clamp-2 min-h-[38px] text-[14px] font-normal leading-[1.35] text-foreground">
          {{ product.name }}
        </h3>
      </NuxtLink>

      <!-- ⭐ Рейтинг -->
      <div v-if="hasRating" class="flex items-center gap-[5px] text-[13px] font-bold text-foreground">
        <Icon name="gravity-ui:star-fill" class="size-3.5 shrink-0 text-rating" />
        <span>{{ ratingLabel }}</span>
        <span class="font-medium text-muted-foreground">· {{ product.review_count }}</span>
      </div>

      <!-- 🎁 Бонусы -->
      <div
        v-if="hasBonus"
        class="inline-flex items-center gap-[7px] self-start rounded-lg bg-gradient-to-r from-orange-50 to-orange-100 px-[11px] py-[7px] text-[13px] font-bold"
      >
        <Icon name="lucide:gift" class="size-3.5 shrink-0 text-orange-500" />
        <span class="bg-gradient-to-r from-orange-400 to-pink-600 bg-clip-text text-transparent">
          {{ bonusLabel }}
        </span>
      </div>

      <!-- 🛒 ПОКУПКА -->
      <div class="mt-auto pt-[5px]">
        <ClientOnly>
          <template v-if="inStock">
            <div
              v-if="quantityInCart > 0"
              class="pc-stepper flex h-[52px] items-center justify-between rounded-full px-[7px]"
            >
              <button
                type="button"
                aria-label="Уменьшить количество"
                class="pc-stepper-btn grid size-[38px] place-content-center rounded-full"
                @click="onDec"
              >
                <Icon name="lucide:minus" class="size-[17px]" />
              </button>
              <span class="flex-1 text-center text-[15px] font-extrabold text-white">{{ quantityInCart }} шт</span>
              <button
                type="button"
                aria-label="Увеличить количество"
                class="pc-stepper-btn grid size-[38px] place-content-center rounded-full"
                @click="onInc"
              >
                <Icon name="lucide:plus" class="size-[17px]" />
              </button>
            </div>

            <div v-else class="flex h-[52px] items-center justify-between gap-2 rounded-full bg-muted pl-4 pr-[5px]">
              <!-- whitespace-nowrap: иначе «15 890 ₸» переносится по пробелу
                   и знак тенге уезжает на вторую строку (узкая колонка на мобильных) -->
              <span class="flex flex-col justify-center leading-tight">
                <span
                  v-if="priceDetails.hasDiscount"
                  class="whitespace-nowrap text-[13px] font-medium text-muted-foreground line-through"
                >
                  {{ formatPrice(priceDetails.originalPrice) }}&nbsp;₸
                </span>
                <span
                  class="whitespace-nowrap text-[17px] font-extrabold"
                  :class="priceDetails.hasDiscount ? 'text-discount' : 'text-foreground'"
                >
                  {{ formatPrice(priceDetails.finalPrice) }}&nbsp;₸
                </span>
              </span>
              <button
                type="button"
                aria-label="В корзину"
                class="pc-add grid size-11 shrink-0 place-content-center rounded-full"
                @click="onAdd"
              >
                <Icon name="lucide:plus" class="size-[26px]" />
              </button>
            </div>
          </template>

          <template v-else>
            <StockAlertButton :product-id="product.id" size="sm" />
          </template>

          <!-- Серверная разметка (и первый кадр до гидрации).
               Здесь был пульсирующий прямоугольник — из-за него цена товара
               не попадала в SSR-HTML вообще: весь блок покупки, вместе с
               ценой, лежит под ClientOnly ради quantityInCart из корзины.
               Замер 24 августа: в серверной разметке главной 8 товаров и ноль
               знаков ₸; на бренд-страницах, которым 22 августа включили SSR
               товаров, — та же дыра.

               Цена и наличие считаются из props и на сервере известны, так
               что заглушка повторяет строку с ценой один в один. Отличие
               одно: вместо <button> здесь <span> — до гидрации нажимать
               нечего, и фокусируемой кнопки-пустышки быть не должно.
               Высота та же, 52px, поэтому сдвига при подмене нет. -->
          <template #fallback>
            <div
              v-if="inStock"
              class="flex h-[52px] items-center justify-between gap-2 rounded-full bg-muted pl-4 pr-[5px]"
            >
              <span class="flex flex-col justify-center leading-tight">
                <span
                  v-if="priceDetails.hasDiscount"
                  class="whitespace-nowrap text-[13px] font-medium text-muted-foreground line-through"
                >
                  {{ formatPrice(priceDetails.originalPrice) }}&nbsp;₸
                </span>
                <span
                  class="whitespace-nowrap text-[17px] font-extrabold"
                  :class="priceDetails.hasDiscount ? 'text-discount' : 'text-foreground'"
                >
                  {{ formatPrice(priceDetails.finalPrice) }}&nbsp;₸
                </span>
              </span>
              <span
                class="pc-add grid size-11 shrink-0 place-content-center rounded-full"
                aria-hidden="true"
              >
                <Icon name="lucide:plus" class="size-[26px]" />
              </span>
            </div>
            <div v-else class="h-[52px] animate-pulse rounded-full bg-muted" />
          </template>
        </ClientOnly>
      </div>
    </div>
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
  .pc-card {
    border: 1px solid rgb(255 255 255 / 0.92);
    box-shadow:
      inset 0 1.5px 0 rgb(255 255 255 / 0.98),
      inset 0 -2px 4px rgb(15 23 42 / 0.07),
      inset 0 0 0 1px rgb(255 255 255 / 0.5),
      0 1px 0 rgb(15 23 42 / 0.05);
    transition:
      box-shadow 0.3s ease,
      border-color 0.3s ease;
  }
  .pc-card--active {
    border-color: var(--primary);
    box-shadow:
      inset 0 0 0 1px var(--primary),
      inset 0 1.5px 0 rgb(255 255 255 / 0.98),
      inset 0 -2px 4px rgb(15 23 42 / 0.07),
      inset 0 0 0 1px rgb(255 255 255 / 0.5),
      0 1px 0 rgb(15 23 42 / 0.05);
  }

  .pc-scroll {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .pc-scroll::-webkit-scrollbar {
    display: none;
  }

  /* ВНИМАНИЕ: у .pc-wish и .pc-add НЕТ backdrop-filter — и добавлять его сюда нельзя.
     Карточка живёт в каруселях и сетках по 18+ штук на экран, а backdrop-filter
     заставляет браузер переснимать и блюрить подложку на каждом кадре. Замер на
     главной (390px, CPU ×6): с блюром медиана кадра 47.6ms / 42% кадров >50ms,
     без него — 24.9ms / 11%. При быстром скролле секции успевали «пропасть и
     появиться». Непрозрачность градиента ниже и так 85–95%, размытия за ним
     почти не видно. Стекло оставлено только там, где оно читается: шапка,
     липкая строка, нижняя навигация, deal-карточка. */
  .pc-wish {
    border: 1px solid rgb(255 255 255 / 0.8);
    background: linear-gradient(150deg, rgb(255 255 255 / 0.92), rgb(255 255 255 / 0.7));
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.9),
      0 4px 12px rgb(15 23 42 / 0.14);
    transition: transform 0.12s ease;
  }
  .pc-wish:hover {
    transform: scale(1.1);
  }

  .pc-add {
    border: 1px solid rgb(255 255 255 / 0.9);
    background: linear-gradient(150deg, rgb(255 255 255 / 0.97), rgb(224 233 247 / 0.85));
    box-shadow:
      inset 0 1px 0 #fff,
      0 4px 12px rgb(43 127 255 / 0.2);
    color: var(--primary);
    transition: background 0.12s ease;
  }
  .pc-add:hover {
    background: linear-gradient(150deg, #fff, rgb(191 219 254 / 0.75));
  }

  .pc-stepper {
    border: 1px solid rgb(255 255 255 / 0.45);
    background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
    -webkit-backdrop-filter: blur(12px) saturate(1.7);
    backdrop-filter: blur(12px) saturate(1.7);
    box-shadow:
      inset 0 1px 0 rgb(255 255 255 / 0.5),
      inset 0 -2px 8px rgb(6 53 138 / 0.28),
      0 8px 20px rgb(43 127 255 / 0.3);
  }

  .pc-stepper-btn {
    background: rgb(255 255 255 / 0.26);
    -webkit-backdrop-filter: blur(8px);
    backdrop-filter: blur(8px);
    box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45);
    color: #fff;
    transition: background 0.12s ease;
  }
  .pc-stepper-btn:hover {
    background: rgb(255 255 255 / 0.38);
  }
}
</style>
