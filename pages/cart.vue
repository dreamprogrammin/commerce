<script setup lang="ts">
import type { ICartItem } from '@/stores/publicStore/cartStore'
import type { BaseProduct, ProductWithImages } from '@/types'
import { storeToRefs } from 'pinia'
import { toast } from 'vue-sonner'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useFlipCounter } from '@/composables/useFlipCounter'
import { useHaptic } from '@/composables/useHaptic'
import { BUCKET_NAME_PRODUCT, FREE_SHIPPING_THRESHOLD } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { formatPrice } from '@/utils/formatPrice'

definePageMeta({ layout: 'checkout' })

// SEO: Закрываем страницу корзины от индексации
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const cartStore = useCartStore()
const authStore = useAuthStore()
const modalStore = useModalStore()
const supabase = useSupabaseClient()
const { items, subtotal, totalItems, deliveryCost, isFreeShipping }
  = storeToRefs(cartStore)
const { isLoggedIn } = storeToRefs(authStore)
const { getVariantUrl } = useSupabaseStorage()
const { trackBeginCheckout } = useEcommerceTracking()
const { triggerHaptic } = useHaptic()

// Прогресс бесплатной доставки
const shippingProgress = computed(() =>
  Math.min((subtotal.value / FREE_SHIPPING_THRESHOLD) * 100, 100),
)

const remainingForFreeShipping = computed(() =>
  Math.max(FREE_SHIPPING_THRESHOLD - subtotal.value, 0),
)

/**
 * Бонусы за заказ без привязки к авторизации.
 *
 * cartStore.bonusesToAward обнуляется для гостя (бонусы копятся только на
 * профиль), но макету это число нужно и в гостевой ветке — там оно работает
 * приманкой «Войдите и получите +N бонусов».
 */
const potentialBonuses = computed(() =>
  items.value.reduce((sum, item) => {
    const award = Number(item.product.bonus_points_award) || 0
    const quantity = Number(item.quantity) || 0
    return sum + award * quantity
  }, 0),
)

// 🔥 Cross-sell: Рекомендованные аксессуары
const suggestedAccessories = ref<ProductWithImages[]>([])
const isLoadingAccessories = ref(false)
const selectedAccessoryIds = ref<string[]>([])

// 🔥 Рекомендуемые товары (лента под списком корзины)
const recommendedProducts = ref<ProductWithImages[]>([])

const selectedAccessories = computed(() =>
  suggestedAccessories.value.filter(acc =>
    selectedAccessoryIds.value.includes(acc.id),
  ),
)

const selectedAccessoriesTotal = computed(() =>
  selectedAccessories.value.reduce(
    (sum, acc) => sum + (acc.final_price || acc.price),
    0,
  ),
)

// «Итого» = товары + отмеченные аксессуары + доставка (как в сайдбаре макета)
const orderTotal = computed(
  () => subtotal.value + selectedAccessoriesTotal.value + deliveryCost.value,
)

// 🔥 Flip animation для итоговой суммы
const digitColumns = ref<HTMLElement[]>([])
const mobileDigitColumns = ref<HTMLElement[]>([])

const priceChars = computed(() => {
  const formatted = formatPrice(orderTotal.value)
  let digitIndex = 0
  return formatted.split('').map((char) => {
    const isDigit = !Number.isNaN(Number(char)) && char !== ' '
    const result = { char, isDigit, digitIndex: isDigit ? digitIndex : -1 }
    if (isDigit)
      digitIndex++
    return result
  })
})

useFlipCounter(orderTotal, digitColumns)
useFlipCounter(orderTotal, mobileDigitColumns)

// --- ПОЗИЦИЯ КОРЗИНЫ ---
function unitPrice(product: ProductWithImages) {
  return product.final_price || product.price
}

function lineTotal(item: ICartItem) {
  return unitPrice(item.product) * item.quantity
}

function isDiscounted(product: ProductWithImages) {
  return !!product.discount_percentage && product.discount_percentage > 0
}

function hasRating(product: ProductWithImages) {
  return Boolean(product.review_count && product.avg_rating)
}

function ratingLabel(product: ProductWithImages) {
  return product.avg_rating != null
    ? product.avg_rating.toFixed(1).replace('.', ',')
    : ''
}

/**
 * Тот же потолок, что и на карточке товара (ProductCard): 80% остатка, чтобы
 * не продать последние штуки, пока склад не сверился.
 */
function maxQuantity(product: ProductWithImages) {
  return Math.max(1, Math.floor((product.stock_quantity || 0) * 0.8))
}

function increase(item: ICartItem) {
  if (item.quantity + 1 > maxQuantity(item.product))
    return
  cartStore.updateQuantity(item.product.id, item.quantity + 1)
  triggerHaptic('light')
}

function decrease(item: ICartItem) {
  cartStore.updateQuantity(item.product.id, item.quantity - 1)
  triggerHaptic('light')
}

async function handleClearCart() {
  await cartStore.clearCart()
  toast.info('Корзина очищена')
}

function handleLogin() {
  modalStore.openLoginModal()
}

function handleCheckout() {
  trackBeginCheckout(
    items.value.map(item => ({
      id: item.product.id,
      name: item.product.name,
      price: unitPrice(item.product),
      quantity: item.quantity,
    })),
    subtotal.value,
  )
  navigateTo('/checkout')
}

// --- ЛЕНТА РЕКОМЕНДАЦИЙ ---
const railRef = ref<HTMLElement | null>(null)

function scrollRail(direction: 1 | -1) {
  railRef.value?.scrollBy({ left: direction * 420, behavior: 'smooth' })
}

// Загрузка рекомендованных аксессуаров
async function loadSuggestedAccessories() {
  if (items.value.length === 0) {
    suggestedAccessories.value = []
    return
  }

  isLoadingAccessories.value = true
  try {
    // Собираем все accessory_ids из товаров в корзине
    const allAccessoryIds = new Set<string>()
    const cartProductIds = new Set(items.value.map(item => item.product.id))

    for (const item of items.value) {
      if (item.product.accessory_ids?.length) {
        item.product.accessory_ids.forEach((id) => {
          // Добавляем только если этого товара еще нет в корзине
          if (!cartProductIds.has(id)) {
            allAccessoryIds.add(id)
          }
        })
      }
    }

    if (allAccessoryIds.size === 0) {
      suggestedAccessories.value = []
      return
    }

    // Загружаем аксессуары (максимум 3)
    const { data, error } = await supabase
      .from('products')
      .select(
        `
        *,
        product_images (
          id,
          image_url,
          blur_placeholder,
          alt_text,
          display_order
        ),
        categories (
          id,
          name,
          slug
        )
      `,
      )
      .in('id', Array.from(allAccessoryIds).slice(0, 3))
      .eq('is_active', true)
      .order('display_order', {
        foreignTable: 'product_images',
        ascending: true,
      })

    if (!error && data) {
      suggestedAccessories.value = data as ProductWithImages[]
    }
  }
  catch (e) {
    console.error('Error loading suggested accessories:', e)
  }
  finally {
    isLoadingAccessories.value = false
  }
}

// Загрузка рекомендуемых товаров из категорий корзины
async function loadRecommendedProducts() {
  if (items.value.length === 0) {
    recommendedProducts.value = []
    return
  }

  try {
    const cartProductIds = new Set(items.value.map(item => item.product.id))

    // Собираем категории товаров в корзине
    const categoryIds = new Set<string>()
    items.value.forEach((item) => {
      if (item.product.category_id) {
        categoryIds.add(item.product.category_id)
      }
    })

    if (categoryIds.size === 0) {
      recommendedProducts.value = []
      return
    }

    const { data, error } = await supabase
      .from('products')
      .select(
        `
        *,
        product_images (
          id,
          image_url,
          blur_placeholder,
          alt_text,
          display_order
        ),
        brands (
          id,
          name,
          slug,
          logo_url
        )
      `,
      )
      .in('category_id', Array.from(categoryIds))
      .not('id', 'in', `(${Array.from(cartProductIds).join(',')})`)
      .eq('is_active', true)
      .gt('stock_quantity', 0)
      .order('created_at', { ascending: false })
      .limit(10)
      .order('display_order', {
        foreignTable: 'product_images',
        ascending: true,
      })

    if (!error && data) {
      recommendedProducts.value = data as ProductWithImages[]
    }
  }
  catch (e) {
    console.error('Error loading recommended products:', e)
  }
}

// Загружаем аксессуары и рекомендации при изменении корзины
watch(
  () => items.value,
  () => {
    loadSuggestedAccessories()
    loadRecommendedProducts()
  },
  {
    deep: true,
    immediate: true,
  },
)

// Получить URL изображения товара
function getProductImageUrl(product: any, variant: 'sm' | 'md' = 'sm') {
  if (!product.product_images?.[0]?.image_url)
    return null
  return getVariantUrl(
    BUCKET_NAME_PRODUCT,
    product.product_images[0].image_url,
    variant,
  )
}

// Добавить аксессуар в корзину
async function addAccessoryToCart(accessory: ProductWithImages) {
  await cartStore.addItem(accessory, 1)
  toast.success('Товар добавлен в корзину')
}

// Добавить выбранные аксессуары в корзину
async function addSelectedAccessoriesToCart() {
  const selected = selectedAccessories.value

  if (selected.length === 0)
    return

  for (const acc of selected) {
    if (!cartStore.items.find(item => item.product.id === acc.id)) {
      await cartStore.addItem(acc, 1)
    }
  }

  toast.success(
    selected.length === 1
      ? 'Аксессуар добавлен в корзину'
      : `${selected.length} аксессуара добавлено в корзину`,
  )

  // Очищаем выбор
  selectedAccessoryIds.value = []
}

// Показать тостер о прогрессе доставки при изменении суммы
let previousSubtotal = subtotal.value
watch(subtotal, (newSubtotal) => {
  if (newSubtotal > previousSubtotal && newSubtotal < FREE_SHIPPING_THRESHOLD) {
    const remaining = FREE_SHIPPING_THRESHOLD - newSubtotal
    toast.info(`До бесплатной доставки осталось ${formatPrice(remaining)} ₸`, {
      description: '🚚 Добавьте ещё товаров для бесплатной доставки',
      duration: 3000,
    })
  }
  else if (
    newSubtotal >= FREE_SHIPPING_THRESHOLD
    && previousSubtotal < FREE_SHIPPING_THRESHOLD
  ) {
    toast.success('🎉 Поздравляем! Доставка бесплатная!', {
      description: 'Вы получили бесплатную доставку',
      duration: 5000,
    })
  }
  previousSubtotal = newSubtotal
})

const containerClass = carouselContainerVariants({ contained: 'always' })

/**
 * Липкая CTA-панель едет вниз синхронно с MobileBottomNav, поэтому пороги
 * скролла здесь скопированы из него один в один: своя эвристика уводила
 * панель и навигацию в разные стороны на одном и том же жесте.
 */
const isNavVisible = ref(true)
let lastScrollY = 0
let ticking = false

function applyScroll() {
  ticking = false
  const y = window.scrollY
  const dy = y - lastScrollY
  if (dy > 6 && y > 280)
    isNavVisible.value = false
  else if (dy < -6 || y < 120)
    isNavVisible.value = true
  lastScrollY = y
}

function handleScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(applyScroll)
  }
}

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', handleScroll, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', handleScroll))
</script>

<template>
  <div :class="`${containerClass} py-6 sm:py-8`">
    <div class="mx-auto w-full max-w-[1200px]">
      <!-- ============ ПУСТАЯ КОРЗИНА ============ -->
      <div
        v-if="items.length === 0"
        class="flex flex-col items-center gap-3.5 px-6 py-12 text-center"
      >
        <span
          class="grid size-[88px] place-content-center rounded-full bg-brand-surface"
        >
          <Icon name="solar:cart-3-bold" class="size-[42px] text-primary" />
        </span>
        <h1 class="text-[22px] font-extrabold tracking-[-0.02em]">
          Корзина пуста
        </h1>
        <p class="max-w-[340px] text-[15px] text-muted-foreground">
          Загляните в каталог — добавьте игрушки, и они появятся здесь.
        </p>
        <NuxtLink
          to="/catalog"
          class="mt-1.5 inline-flex h-12 items-center rounded-xl bg-primary px-[26px] text-[15px] font-bold text-primary-foreground transition-colors hover:bg-brand-hover"
        >
          Перейти в каталог
        </NuxtLink>
      </div>

      <!-- ============ КОРЗИНА С ТОВАРАМИ ============ -->
      <div
        v-else
        class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_344px] lg:items-start lg:gap-6"
      >
        <!-- Основная колонка -->
        <div class="flex min-w-0 flex-col gap-7">
          <!-- Заголовок -->
          <div class="flex items-center justify-between gap-3">
            <h1
              class="flex items-baseline gap-2.5 text-[clamp(22px,3vw,28px)] font-extrabold tracking-[-0.025em]"
            >
              Корзина <span class="text-primary">{{ totalItems }}</span>
            </h1>
            <button
              type="button"
              class="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-destructive"
              @click="handleClearCart"
            >
              <Icon name="lucide:trash-2" class="size-4" />
              <span class="hidden sm:inline">Очистить корзину</span>
              <span class="sm:hidden">Очистить</span>
            </button>
          </div>

          <!-- Прогресс бесплатной доставки -->
          <div
            class="cart-surface flex items-center gap-3 rounded-[18px] bg-white px-4 py-3"
          >
            <Icon
              name="lucide:truck"
              class="size-5 shrink-0"
              :class="isFreeShipping ? 'text-success' : 'text-primary'"
            />
            <div class="min-w-0 flex-1">
              <p
                v-if="isFreeShipping"
                class="text-[13px] font-semibold text-success"
              >
                Доставка бесплатная — порог пройден 🎉
              </p>
              <p v-else class="text-[13px] text-muted-foreground">
                До бесплатной доставки
                <b class="font-bold text-primary">{{ formatPrice(remainingForFreeShipping) }} ₸</b>
              </p>
              <Progress :model-value="shippingProgress" class="mt-2 h-1.5" />
            </div>
          </div>

          <!-- Товары -->
          <div class="flex flex-col gap-2.5">
            <article
              v-for="item in items"
              :key="item.product.id"
              class="cart-surface relative flex flex-wrap items-start gap-3 rounded-[20px] bg-white p-2.5"
            >
              <NuxtLink
                :to="`/catalog/products/${item.product.slug}`"
                class="grid size-24 shrink-0 place-content-center overflow-hidden rounded-[14px] bg-white"
              >
                <ProgressiveImage
                  v-if="getProductImageUrl(item.product)"
                  :src="getProductImageUrl(item.product)!"
                  :alt="item.product.name"
                  aspect-ratio="square"
                  object-fit="contain"
                  placeholder-type="lqip"
                  :blur-data-url="item.product.product_images?.[0]?.blur_placeholder"
                  class="size-full"
                />
                <span
                  v-else
                  class="text-xs text-muted-foreground"
                >Нет фото</span>
              </NuxtLink>

              <div
                class="flex min-w-[140px] flex-1 flex-col gap-[7px] pr-[38px] pt-0.5"
              >
                <NuxtLink :to="`/catalog/products/${item.product.slug}`">
                  <h3
                    class="line-clamp-2 text-sm font-normal leading-[1.35] text-foreground transition-colors hover:text-primary"
                  >
                    {{ item.product.name }}
                  </h3>
                </NuxtLink>

                <div
                  v-if="hasRating(item.product)"
                  class="flex items-center gap-[5px] text-[13px] font-bold text-foreground"
                >
                  <Icon
                    name="gravity-ui:star-fill"
                    class="size-3.5 shrink-0 text-rating"
                  />
                  <span>{{ ratingLabel(item.product) }}</span>
                  <span class="font-medium text-muted-foreground">· {{ item.product.review_count }}</span>
                </div>

                <span
                  v-if="item.product.bonus_points_award"
                  class="cart-bonus-chip inline-flex items-center gap-[7px] self-start whitespace-nowrap rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-bold"
                >
                  <Icon
                    name="lucide:gift"
                    class="size-[13px] shrink-0 text-orange-500"
                  />
                  <span class="cart-bonus-chip__text">
                    +{{ formatPrice((item.product.bonus_points_award || 0) * item.quantity) }} бонусов
                  </span>
                </span>
              </div>

              <button
                type="button"
                aria-label="Убрать из корзины"
                class="absolute right-2 top-2 z-[2] grid size-8 place-content-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
                @click="cartStore.removeItem(item.product.id)"
              >
                <Icon name="lucide:x" class="size-[18px]" />
              </button>

              <div
                class="flex min-w-[212px] flex-[1_0_auto] justify-end self-end"
              >
                <div class="flex items-center gap-3">
                  <span class="flex flex-col items-end leading-[1.2]">
                    <span
                      v-if="isDiscounted(item.product)"
                      class="whitespace-nowrap text-[13px] font-medium text-price-old line-through"
                    >
                      {{ formatPrice(item.product.price * item.quantity) }} ₸
                    </span>
                    <b
                      class="whitespace-nowrap text-[17px] font-extrabold"
                      :class="isDiscounted(item.product) ? 'text-discount' : 'text-foreground'"
                    >
                      {{ formatPrice(lineTotal(item)) }} ₸
                    </b>
                  </span>

                  <div
                    class="cart-stepper flex h-11 w-[126px] items-center justify-between rounded-full px-[5px]"
                  >
                    <button
                      type="button"
                      aria-label="Меньше"
                      class="cart-stepper-btn grid size-[34px] place-content-center rounded-full"
                      @click="decrease(item)"
                    >
                      <Icon name="lucide:minus" class="size-4" />
                    </button>
                    <span
                      class="flex-1 text-center text-sm font-extrabold text-white"
                    >{{ item.quantity }}</span>
                    <button
                      type="button"
                      aria-label="Больше"
                      class="cart-stepper-btn grid size-[34px] place-content-center rounded-full disabled:cursor-not-allowed disabled:opacity-45"
                      :disabled="item.quantity >= maxQuantity(item.product)"
                      @click="increase(item)"
                    >
                      <Icon name="lucide:plus" class="size-4" />
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </div>

          <!-- Cross-sell: Рекомендованные аксессуары -->
          <AccessoriesBlock
            v-if="suggestedAccessories.length > 0"
            v-model:selected-ids="selectedAccessoryIds"
            :accessories="suggestedAccessories"
            :loading="isLoadingAccessories"
            cart-mode
            @add-to-cart="addSelectedAccessoriesToCart"
            @add-item="(id) => addAccessoryToCart(suggestedAccessories.find(a => a.id === id)!)"
          />

          <!-- Рекомендуемые товары -->
          <section v-if="recommendedProducts.length > 0">
            <div class="mb-3.5 flex items-center justify-between gap-3">
              <h2
                class="text-[clamp(18px,2vw,22px)] font-extrabold tracking-[-0.02em]"
              >
                Рекомендуемые товары
              </h2>
              <div class="hidden gap-2 sm:flex">
                <button
                  type="button"
                  aria-label="Предыдущие товары"
                  class="grid size-10 place-content-center rounded-full border bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  @click="scrollRail(-1)"
                >
                  <Icon name="lucide:chevron-left" class="size-5" />
                </button>
                <button
                  type="button"
                  aria-label="Следующие товары"
                  class="grid size-10 place-content-center rounded-full border bg-white text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  @click="scrollRail(1)"
                >
                  <Icon name="lucide:chevron-right" class="size-5" />
                </button>
              </div>
            </div>
            <div
              ref="railRef"
              class="cart-rail flex gap-2.5 overflow-x-auto pb-1"
            >
              <div
                v-for="product in recommendedProducts"
                :key="product.id"
                class="w-[214px] shrink-0"
              >
                <ProductCard
                  :product="product as unknown as BaseProduct"
                  class="h-full"
                />
              </div>
            </div>
          </section>
        </div>

        <!-- ============ САЙДБАР «ВАШ ЗАКАЗ» ============ -->
        <aside
          class="hidden rounded-[18px] bg-muted p-[22px] lg:sticky lg:top-[88px] lg:block"
        >
          <div class="mb-4 text-lg font-extrabold tracking-[-0.02em]">
            Ваш заказ
          </div>

          <div class="flex flex-col gap-[11px] text-sm font-medium">
            <div class="flex items-center justify-between">
              <span class="text-muted-foreground">Товары, {{ totalItems }} шт</span>
              <span>{{ formatPrice(subtotal) }} ₸</span>
            </div>

            <div
              v-for="acc in selectedAccessories"
              :key="acc.id"
              class="flex items-center justify-between gap-2 text-primary"
            >
              <span class="line-clamp-1">{{ acc.name }}</span>
              <span class="shrink-0">+{{ formatPrice(acc.final_price || acc.price) }} ₸</span>
            </div>

            <div class="flex items-center justify-between">
              <span class="inline-flex items-center gap-1.5 text-muted-foreground">
                Доставка
                <Icon name="lucide:info" class="size-3.5 text-muted-foreground/70" />
              </span>
              <span
                v-if="isFreeShipping"
                class="font-semibold text-success"
              >Бесплатно</span>
              <span v-else>{{ formatPrice(deliveryCost) }} ₸</span>
            </div>
          </div>

          <Separator class="my-4" />

          <div class="mb-1.5 flex items-baseline justify-between">
            <span class="text-base font-bold">Итого</span>
            <!-- items-center, а не baseline: у .digit-column overflow:hidden,
                 его базовая линия — нижняя грань бокса, и «₸» уезжает вниз. -->
            <div class="flex items-center gap-1">
              <div class="flex text-[22px] font-extrabold">
                <template v-for="(char, index) in priceChars" :key="index">
                  <span v-if="char.char === ' '" class="w-1.5 shrink-0" />
                  <div
                    v-else-if="char.isDigit"
                    :ref="(el) => { if (el) digitColumns[char.digitIndex] = el as HTMLElement }"
                    class="digit-column"
                  >
                    <div class="digit-ribbon">
                      <div v-for="d in 10" :key="d" class="digit-item">
                        {{ d - 1 }}
                      </div>
                    </div>
                  </div>
                  <span v-else>{{ char.char }}</span>
                </template>
              </div>
              <span class="text-[22px] font-extrabold">₸</span>
            </div>
          </div>

          <ClientOnly>
            <div
              v-if="isLoggedIn"
              class="mb-4 flex items-center justify-between text-[13px] font-bold text-bonus"
            >
              <span class="inline-flex items-center gap-1.5">
                <Icon name="lucide:gift" class="size-3.5" />
                Начислим бонусов
              </span>
              <span>+{{ formatPrice(potentialBonuses) }} бонусов</span>
            </div>
            <button
              v-else
              type="button"
              class="mb-3.5 flex w-full items-center gap-2.5 rounded-xl bg-bonus-surface p-3 text-left transition-opacity hover:opacity-90"
              @click="handleLogin"
            >
              <Icon name="lucide:gift" class="size-4 shrink-0 text-bonus" />
              <span class="flex-1 text-xs font-semibold leading-[1.35]">
                Войдите и получите +{{ formatPrice(potentialBonuses) }} бонусов
              </span>
              <span class="text-xs font-bold text-primary">Войти</span>
            </button>
          </ClientOnly>

          <button
            type="button"
            class="cart-cta flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-extrabold text-white"
            @click="handleCheckout"
          >
            Перейти к оформлению
            <Icon name="lucide:arrow-right" class="size-[18px]" />
          </button>

          <NuxtLink
            to="/catalog"
            class="mt-3 flex h-11 w-full items-center justify-center rounded-full text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
          >
            Продолжить покупки
          </NuxtLink>
        </aside>
      </div>

      <!-- Компенсация высоты липкой панели на мобильных -->
      <div v-if="items.length > 0" class="h-[168px] lg:hidden" />
    </div>

    <!-- ============ МОБИЛЬНАЯ CTA-ПАНЕЛЬ ============ -->
    <ClientOnly>
      <div
        v-if="items.length > 0"
        class="cart-mobile-cta fixed inset-x-3 z-40 lg:hidden"
        :class="isNavVisible ? 'cart-mobile-cta--above-nav' : 'cart-mobile-cta--at-bottom'"
      >
        <button
          type="button"
          class="cart-mobile-cta__btn flex h-[60px] w-full items-center justify-between rounded-[22px] px-[22px] text-white"
          @click="handleCheckout"
        >
          <span class="text-base font-bold">Перейти к оформлению</span>
          <span class="flex flex-col items-end leading-[1.12]">
            <b class="flex items-center text-[17px] font-extrabold">
              <template v-for="(char, index) in priceChars" :key="`mobile-${index}`">
                <span v-if="char.char === ' '" class="w-1 shrink-0" />
                <span
                  v-else-if="char.isDigit"
                  :ref="(el) => { if (el) mobileDigitColumns[char.digitIndex] = el as HTMLElement }"
                  class="digit-column"
                >
                  <span class="digit-ribbon">
                    <span v-for="d in 10" :key="d" class="digit-item">{{ d - 1 }}</span>
                  </span>
                </span>
                <span v-else>{{ char.char }}</span>
              </template>
              <span class="ml-0.5">₸</span>
            </b>
            <span
              v-if="potentialBonuses > 0"
              class="inline-flex items-center gap-1 text-[11px] font-semibold opacity-90"
            >
              <Icon name="lucide:gift" class="size-[11px]" />
              +{{ formatPrice(potentialBonuses) }}
            </span>
          </span>
        </button>
      </div>
    </ClientOnly>
  </div>
</template>

<style scoped>
/* Поверхность карточек макета: белое «стекло» с внутренним рельефом.
   Тот же рецепт, что у .pc-card в components/global/ProductCard.vue —
   карточки корзины и карточки товара обязаны читаться как один материал. */
.cart-surface {
  border: 1px solid var(--border);
  box-shadow:
    inset 0 1.5px 0 rgb(255 255 255 / 0.98),
    inset 0 -2px 4px rgb(15 23 42 / 0.07),
    inset 0 0 0 1px rgb(255 255 255 / 0.5),
    0 1px 0 rgb(15 23 42 / 0.05);
}

/* Бонусный чип. Угол 100deg взят из макета — утилитой не выразить
   (bg-gradient-to-r даёт 90deg), поэтому свой класс. Цвета литералами
   по той же причине, что и ниже: Tailwind 4 выкидывает переменную темы,
   если её не использует ни одна утилита. */
.cart-bonus-chip {
  background: linear-gradient(100deg, oklch(0.98 0.016 73.684) 0%, oklch(0.954 0.038 75.164) 100%);
}

.cart-bonus-chip__text {
  background: linear-gradient(100deg, oklch(0.75 0.183 55.934) 0%, oklch(0.592 0.249 0.584) 100%);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--bonus);
}

/* Синий градиентный степпер — общий с .pc-stepper карточки товара.
   Значения записаны литералами, а не через var(--color-blue-*): Tailwind 4
   выкидывает переменную темы, если её не использует ни одна утилита. */
.cart-stepper {
  border: 1px solid rgb(255 255 255 / 0.45);
  background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    inset 0 -2px 8px rgb(6 53 138 / 0.28),
    0 8px 20px rgb(43 127 255 / 0.3);
}

.cart-stepper-btn {
  background: rgb(255 255 255 / 0.26);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.45);
  color: #fff;
  transition: background 0.12s ease;
}
.cart-stepper-btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.38);
}

.cart-cta {
  border: 1px solid rgb(255 255 255 / 0.45);
  background: linear-gradient(150deg, rgb(77 148 255 / 0.95), rgb(23 101 235 / 0.85));
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.5),
    inset 0 -2px 8px rgb(6 53 138 / 0.28),
    0 8px 20px rgb(43 127 255 / 0.3);
  transition: background 0.15s ease;
}
.cart-cta:hover {
  background: linear-gradient(150deg, rgb(96 163 255 / 1), rgb(29 112 246 / 0.92));
}

/* Лента рекомендаций: полосу прокрутки прячем, свайп остаётся. */
.cart-rail {
  scrollbar-width: none;
  -ms-overflow-style: none;
  scroll-behavior: smooth;
}
.cart-rail::-webkit-scrollbar {
  display: none;
}

/* Липкая панель. Базовая позиция — у нижнего края (когда навбар скрыт),
   при видимом навбаре поднимаем на его высоту. Анимируем transform, а не
   bottom + env(): последнее не composited и дёргается на iOS. */
.cart-mobile-cta {
  bottom: calc(16px + env(safe-area-inset-bottom));
  transition: transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}
.cart-mobile-cta--above-nav {
  transform: translateY(-68px);
}
.cart-mobile-cta--at-bottom {
  transform: translateY(0);
}

.cart-mobile-cta__btn {
  border: 1px solid rgb(255 255 255 / 0.45);
  background: linear-gradient(180deg, rgb(59 138 255 / 0.92), rgb(43 127 255 / 0.9));
  -webkit-backdrop-filter: blur(22px) saturate(1.6);
  backdrop-filter: blur(22px) saturate(1.6);
  box-shadow:
    0 14px 34px rgb(43 127 255 / 0.36),
    inset 0 1px 0 rgb(255 255 255 / 0.4);
  transition: background 0.15s ease;
}
.cart-mobile-cta__btn:hover {
  background: linear-gradient(180deg, rgb(59 138 255 / 1), rgb(37 105 235 / 0.96));
}

/* Flip counter styles */
/* flex-shrink: 0 обязателен. Колонка лежит во флекс-контейнере (в сайдбаре
   это .flex у обёртки цены, в мобильной панели — <b class="flex">), а у
   флекс-элементов по умолчанию flex-shrink: 1. При длинной сумме на узком
   экране колонки сжимались, и цифры подрезало по бокам: у колонки
   overflow: hidden. Ширина 0.65em здесь — не пожелание, а размер барабана. */
.digit-column {
  position: relative;
  display: inline-block;
  flex-shrink: 0;
  width: 0.65em;
  height: 1.5em;
  overflow: hidden;
  line-height: 1.5em;
  text-align: center;
  vertical-align: baseline;
}

.digit-ribbon {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  will-change: transform;
}

/* display:block обязателен: в мобильной панели барабан собран из <span>
   (родитель — инлайновый <b>), а высота на инлайновом элементе не работает —
   лента перестала бы прокручиваться ровно на одну цифру. */
.digit-item {
  display: block;
  height: 1.5em;
  line-height: 1.5em;
  text-align: center;
}
</style>
