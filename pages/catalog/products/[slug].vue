<script setup lang="ts">
import type { IBreadcrumbItem, ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
import Breadcrumbs from '@/components/global/Breadcrumbs.vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useFlipCounter } from '@/composables/useFlipCounter'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const route = useRoute()
const router = useRouter()
const productsStore = useProductsStore()
const cartStore = useCartStore()
const categoriesStore = useCategoriesStore()
const containerClass = carouselContainerVariants({ contained: 'always' })
const { getImageUrl } = useSupabaseStorage()

const slug = computed(() => route.params.slug as string)

const selectedAccessoryIds = ref<string[]>([])
const activeTab = ref<'description' | 'features'>('description')

const similarProductsRef = ref<HTMLElement | null>(null)
const showStickyPanel = ref(true)

const { data: productData, error: productError } = await useAsyncData(
  `product-main-${slug.value}`,
  async () => {
    await categoriesStore.fetchCategoryData()
    const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)
    return fetchedProduct
  },
  {
    watch: [slug],
  },
)

if (!productData.value && !productError.value) {
  throw createError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
}

const product = computed(() => productData.value)

const { data: extraData, pending: isExtraLoading } = useAsyncData(
  `product-extra-${slug.value}`,
  async () => {
    if (!product.value)
      return { accessories: [], similarProducts: [] }

    const [accData, similarData] = await Promise.all([
      (async () => {
        if (product.value?.accessory_ids?.length) {
          return await productsStore.fetchProductsByIds(product.value.accessory_ids)
        }
        return []
      })(),

      (async () => {
        if (product.value?.category_id) {
          return await productsStore.fetchSimilarProducts(
            product.value.category_id,
            [product.value.id, ...(product.value.accessory_ids || [])],
          )
        }
        return []
      })(),
    ])

    return { accessories: accData, similarProducts: similarData }
  },
  {
    server: false,
    lazy: true,
    watch: [product],
  },
)

const accessories = computed(() => extraData.value?.accessories || [])
const similarProducts = computed(() => extraData.value?.similarProducts || [])
const digitColumns = ref<HTMLElement[]>([])
const isLoading = computed(() => !product.value)
const breadcrumbs = computed<IBreadcrumbItem[]>(() => {
  if (!product.value) {
    return []
  }

  let crumbs: IBreadcrumbItem[] = []

  if (product.value.categories?.slug) {
    crumbs = categoriesStore.getBreadcrumbs(product.value.categories.slug)
  }

  crumbs.push({
    id: product.value.id,
    name: product.value.name,
  })

  return crumbs
})

const totalPrice = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.price)
  const selected = accessories.value.filter(acc => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.price)
  }
  return total
})

const totalBonuses = computed(() => {
  if (!product.value)
    return 0
  let total = Number(product.value.bonus_points_award)
  const selected = accessories.value.filter(acc => selectedAccessoryIds.value.includes(acc.id))
  for (const acc of selected) {
    total += Number(acc.bonus_points_award)
  }
  return total
})

const mainItemInCart = computed(() => {
  if (!product.value)
    return undefined
  return cartStore.items.find(item => item.product.id === product.value?.id)
})

const quantityInCart = computed(() => {
  return mainItemInCart.value ? mainItemInCart.value.quantity : 0
})

function addToCart() {
  if (!product.value)
    return

  if (!mainItemInCart.value) {
    cartStore.addItem(product.value, 1)
  }

  const selectedAccessories = accessories.value.filter(acc =>
    selectedAccessoryIds.value.includes(acc.id),
  )
  for (const acc of selectedAccessories) {
    const accInCart = cartStore.items.find(item => item.product.id === acc.id)
    if (!accInCart) {
      cartStore.addItem(acc, 1)
    }
  }

  toast.success('Товары добавлены в корзину')
}

function getAccessoryImageUrl(imageUrl: string | null) {
  if (!imageUrl)
    return null

  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.THUMBNAIL)
}

useFlipCounter(totalPrice, digitColumns)

onMounted(() => {
  if (!similarProductsRef.value)
    return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        showStickyPanel.value = !entry.isIntersecting
      })
    },
    {
      rootMargin: '-64px 0px 0px 0px',
      threshold: 0,
    },
  )

  observer.observe(similarProductsRef.value)

  onUnmounted(() => {
    observer.disconnect()
  })
})

watch(isLoading, (newIsLoading) => {
  if (newIsLoading === false && !product.value) {
    showError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
  }
})

const quantity = ref(1)

watch(() => product.value?.id, () => {
  quantity.value = 1
}, { immediate: true })

// 🔥 SEO & OG IMAGE
const canonicalUrl = computed(() => {
  if (!product.value)
    return ''
  return `https://commerce-eta-wheat.vercel.app/catalog/products/${product.value.slug}`
})

const metaTitle = computed(() => {
  if (!product.value)
    return 'Загрузка товара...'
  return `${product.value.name} - Купить в интернет-магазине | Ухтышка`
})

const metaDescription = computed(() => {
  if (!product.value)
    return ''

  const priceInfo = `Цена: ${Math.round(product.value.price).toLocaleString()} ₸`
  const stockInfo = product.value.stock_quantity > 0 ? 'В наличии' : 'Под заказ'
  const desc = product.value.description
    ? `${product.value.description.substring(0, 120)}...`
    : 'Качественный товар по выгодной цене'

  return `${desc} ${priceInfo}. ${stockInfo}. Быстрая доставка по Казахстану.`
})

const categoryName = computed(() => product.value?.categories?.name)
const brandName = computed(() => product.value?.brands?.name)

const robotsRule = computed(() => {
  if (!product.value) {
    return { noindex: true, nofollow: true }
  }

  if (!product.value.description && product.value.stock_quantity === 0) {
    return { noindex: true, follow: true }
  }

  return { index: true, follow: true }
})

useRobotsRule(robotsRule)

// 🔥 ПРАВИЛЬНОЕ РЕШЕНИЕ: Используем прямую ссылку на картинку из Supabase
const ogImageUrl = computed(() => {
  if (!product.value?.product_images?.[0]?.image_url) {
    // Fallback - дефолтное изображение с вашего сайта
    return 'https://commerce-eta-wheat.vercel.app/og-default.jpg'
  }

  const imageUrl = product.value.product_images[0].image_url
  // Используем прямую ссылку на картинку из Supabase Storage
  return `https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/${BUCKET_NAME_PRODUCT}/${imageUrl}`
})

// 🔥 Настраиваем OG Image через defineOgImage
defineOgImage({
  url: ogImageUrl.value,
  width: 1200,
  height: 630,
  alt: computed(() => product.value?.name || 'Товар'),
})

// Добавляем мета-теги
useSeoMeta({
  title: metaTitle,
  description: metaDescription,
  ogTitle: metaTitle,
  ogDescription: metaDescription,
  ogUrl: canonicalUrl,
  ogSiteName: 'Ухтышка',
  ogLocale: 'ru_RU',

  // Twitter
  twitterCard: 'summary_large_image',
  twitterTitle: metaTitle,
  twitterDescription: metaDescription,

  // Robots
  robots: computed(() => robotsRule.value.noindex ? 'noindex, follow' : 'index, follow'),
})

useHead(() => ({
  meta: [
    // Product specific OG tags
    { property: 'og:type', content: 'product' },
    { property: 'product:price:amount', content: String(product.value?.price || 0) },
    { property: 'product:price:currency', content: 'KZT' },
    { property: 'product:availability', content: (product.value?.stock_quantity || 0) > 0 ? 'in stock' : 'out of stock' },
    { property: 'product:brand', content: brandName.value || '' },
    { property: 'product:category', content: categoryName.value || '' },
  ],
  link: [
    { rel: 'canonical', href: canonicalUrl.value },
  ],
  script: [
    {
      type: 'application/ld+json',
      children: JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        'name': product.value?.name,
        'description': product.value?.description,
        'image': ogImageUrl.value,
        'brand': {
          '@type': 'Brand',
          'name': brandName.value || 'Ухтышка',
        },
        'offers': {
          '@type': 'Offer',
          'price': product.value?.price,
          'priceCurrency': 'KZT',
          'availability': (product.value?.stock_quantity || 0) > 0
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          'url': canonicalUrl.value,
        },
      }),
    },
  ],
}))
</script>

<template>
  <!-- Остальной template без изменений -->
  <div class="bg-background">
    <div :class="`${containerClass} py-4 lg:py-6`">
      <ClientOnly>
        <ProductDetailSkeleton v-if="isExtraLoading" />

        <div v-else-if="product">
          <!-- Breadcrumbs с кнопкой избранного -->
          <div class="flex items-center justify-between mb-4">
            <Breadcrumbs :items="breadcrumbs" compact class="flex-1" />

            <!-- Кнопка избранного для мобильных -->
            <ProductWishlistButton :product-id="product.id" :product-name="product.name" class="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg border bg-white hover:bg-muted transition-colors" />
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
            <!-- Левая колонка: Галерея -->
            <div class="lg:col-span-7">
              <div class="bg-white rounded-xl lg:p-4 lg:shadow-sm lg:border">
                <ProductGallery
                  v-if="product.product_images && product.product_images.length > 0"
                  :images="product.product_images"
                />

                <div v-else class="bg-muted rounded-lg flex items-center justify-center h-64 lg:h-96">
                  <p class="text-muted-foreground">
                    Изображения отсутствуют
                  </p>
                </div>
              </div>
            </div>

            <!-- Правая колонка: Информация о товаре -->
            <div class="lg:col-span-5">
              <div class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border sticky top-4">
                <!-- Название товара -->
                <h1 class="text-xl lg:text-2xl font-bold mb-3 lg:mb-4 leading-tight">
                  {{ product.name }}
                </h1>

                <!-- Цена -->
                <div class="mb-6 lg:mb-8">
                  <div class="flex items-baseline gap-3 mb-2">
                    <p class="text-3xl lg:text-4xl font-bold text-primary">
                      {{ Math.round(totalPrice).toLocaleString() }} ₸
                    </p>
                  </div>

                  <!-- Бонусы -->
                  <div class="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-sm font-medium">
                    <Icon name="lucide:gift" class="w-4 h-4" />
                    <span>+{{ totalBonuses }} бонусов</span>
                  </div>
                </div>

                <!-- Наличие -->
                <div class="mb-6 pb-6 border-b">
                  <div class="flex items-center gap-2 text-sm">
                    <Icon
                      :name="product.stock_quantity > 0 ? 'lucide:check-circle' : 'lucide:x-circle'"
                      :class="product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'"
                      class="w-5 h-5"
                    />
                    <span :class="product.stock_quantity > 0 ? 'text-green-600' : 'text-red-600'" class="font-medium">
                      {{ product.stock_quantity > 0 ? 'В наличии' : 'Нет в наличии' }}
                    </span>
                    <span v-if="product.stock_quantity > 0" class="text-muted-foreground">
                      ({{ product.stock_quantity }} шт.)
                    </span>
                  </div>
                </div>

                <!-- Кнопки действий (десктоп) -->
                <ClientOnly>
                  <div class="hidden lg:block space-y-3 mb-6">
                    <template v-if="product.stock_quantity > 0">
                      <Button
                        v-if="!mainItemInCart"
                        size="lg"
                        class="w-full h-12 text-base font-semibold"
                        @click="addToCart"
                      >
                        <Icon name="lucide:shopping-cart" class="w-5 h-5 mr-2" />
                        Добавить в корзину
                      </Button>

                      <div v-else class="flex items-center gap-3">
                        <Button
                          size="lg"
                          class="flex-grow h-12 text-base font-semibold"
                          @click="router.push('/cart')"
                        >
                          <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
                          Перейти в корзину
                        </Button>

                        <QuantitySelector
                          :product="product"
                          :quantity="quantityInCart"
                          class="w-auto"
                        />
                      </div>
                    </template>

                    <Button v-else size="lg" class="w-full h-12" disabled>
                      Нет в наличии
                    </Button>

                    <Button size="lg" variant="outline" class="w-full h-12 text-base">
                      <Icon name="mdi:heart-outline" class="w-5 h-5 mr-2" />
                      В избранное
                    </Button>
                  </div>
                </ClientOnly>
              </div>

              <!-- Аксессуары -->
              <div v-if="accessories.length > 0" class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-4">
                <h3 class="font-bold text-lg mb-4 flex items-center gap-2">
                  <Icon name="lucide:plus-circle" class="w-5 h-5 text-primary" />
                  С этим товаром покупают
                </h3>
                <div class="space-y-3">
                  <div
                    v-for="acc in accessories"
                    :key="acc.id"
                    class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer select-none transition-all hover:shadow-md has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
                    @click="() => {
                      const isChecked = selectedAccessoryIds.includes(acc.id)
                      if (isChecked) {
                        selectedAccessoryIds = selectedAccessoryIds.filter(id => id !== acc.id)
                      }
                      else {
                        selectedAccessoryIds.push(acc.id)
                      }
                    }"
                  >
                    <div @click.stop>
                      <Checkbox
                        :id="`acc-${acc.id}`"
                        :model-value="selectedAccessoryIds.includes(acc.id)"
                        @update:model-value="(checkedState) => {
                          if (checkedState === true) {
                            if (!selectedAccessoryIds.includes(acc.id)) {
                              selectedAccessoryIds.push(acc.id)
                            }
                          }
                          else if (checkedState === false) {
                            selectedAccessoryIds = selectedAccessoryIds.filter(id => id !== acc.id)
                          }
                        }"
                      />
                    </div>
                    <div class="w-14 h-14 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        v-if="acc.product_images && acc.product_images.length > 0"
                        :src="getAccessoryImageUrl(acc.product_images[0]?.image_url || null) || '/images/placeholder.svg'"
                        :alt="acc.name"
                        class="w-full h-full object-cover"
                        loading="lazy"
                      >
                      <div v-else class="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Нет фото
                      </div>
                    </div>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-medium leading-tight mb-1">
                        {{ acc.name }}
                      </p>
                      <p class="text-sm font-bold text-primary">
                        + {{ acc.price }} ₸
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Описание и характеристики (табы) -->
          <div class="bg-white rounded-xl p-4 lg:p-6 shadow-sm border mt-6 lg:mt-8">
            <!-- Табы -->
            <div class="border-b mb-6">
              <div class="flex gap-6">
                <button
                  class="pb-3 px-1 font-semibold text-base transition-colors relative" :class="[
                    activeTab === 'description'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  ]"
                  @click="activeTab = 'description'"
                >
                  Описание
                  <div
                    v-if="activeTab === 'description'"
                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  />
                </button>
                <button
                  class="pb-3 px-1 font-semibold text-base transition-colors relative" :class="[
                    activeTab === 'features'
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  ]"
                  @click="activeTab = 'features'"
                >
                  Характеристики
                  <div
                    v-if="activeTab === 'features'"
                    class="absolute bottom-0 left-0 right-0 h-0.5 bg-primary"
                  />
                </button>
              </div>
            </div>

            <!-- Контент табов -->
            <div class="prose max-w-none">
              <div v-if="activeTab === 'description'">
                <ProductDescription v-if="product.description" :description="product.description" />
                <p v-else class="text-muted-foreground">
                  Описание отсутствует
                </p>
              </div>

              <div v-if="activeTab === 'features'">
                <ProductFeatures :product="product" />
              </div>
            </div>
          </div>
        </div>

        <div v-else class="text-center py-20">
          <h1 class="text-2xl font-bold">
            Товар не найден
          </h1>
          <p class="text-muted-foreground mt-2">
            Возможно, товар был удален или ссылка неверна.
          </p>
          <NuxtLink to="/catalog" class="inline-block mt-4 text-primary hover:underline">
            ← Вернуться в каталог
          </NuxtLink>
        </div>

        <template #fallback>
          <ProductDetailSkeleton />
        </template>
      </ClientOnly>
    </div>

    <!-- Стики панель для мобильных -->
    <ClientOnly>
      <Transition
        enter-active-class="transition-transform duration-300 ease-out"
        enter-from-class="translate-y-full"
        enter-to-class="translate-y-0"
        leave-active-class="transition-transform duration-300 ease-in"
        leave-from-class="translate-y-0"
        leave-to-class="translate-y-full"
      >
        <div
          v-if="product && showStickyPanel"
          class="lg:hidden sticky bottom-16 left-0 right-0 bg-white border-t shadow-lg z-40"
        >
          <div class="px-4 py-3">
            <div class="flex items-center gap-3 justify-between">
              <div v-if="!mainItemInCart" class="flex-shrink-0">
                <p class="text-xs text-muted-foreground mb-0.5">
                  Цена
                </p>
                <p class="text-xl font-bold text-primary">
                  {{ Math.round(totalPrice).toLocaleString() }} ₸
                </p>
              </div>

              <template v-if="product.stock_quantity > 0">
                <Button
                  v-if="!mainItemInCart"
                  size="lg"
                  class="h-11 text-base font-semibold"
                  @click="addToCart"
                >
                  <Icon name="lucide:shopping-cart" class="w-5 h-5 mr-2" />
                  В корзину
                </Button>

                <div v-else class="flex justify-between items-center gap-3 flex-grow">
                  <Button
                    size="lg"
                    class="h-11 text-base font-semibold"
                    @click="router.push('/cart')"
                  >
                    <Icon name="lucide:shopping-bag" class="w-5 h-5 mr-2" />
                    В корзине
                  </Button>

                  <QuantitySelector
                    :product="product"
                    :quantity="quantityInCart"
                    class="w-auto"
                  />
                </div>
              </template>

              <Button v-else size="lg" class="flex-grow h-11" disabled>
                Нет в наличии
              </Button>
            </div>
          </div>
        </div>
      </Transition>
    </ClientOnly>

    <!-- Похожие товары -->
    <div
      v-if="similarProducts.length > 0"
      ref="similarProductsRef"
      class="bg-gray-50 py-8 lg:py-12 mt-8 lg:mt-12"
    >
      <ProductCarousel :products="similarProducts">
        <template #header>
          <h2 class="text-2xl lg:text-3xl font-bold mb-6">
            Похожие товары
          </h2>
        </template>
      </ProductCarousel>
    </div>
  </div>
</template>

<style scoped>
.digit-column {
  height: 1.75rem;
  line-height: 1.75rem;
  overflow: hidden;
  position: relative;
  width: 1.125rem;
  text-align: center;
  border-radius: 0.25rem;
  transition: background-color 0.3s ease;
}

@media (min-width: 1024px) {
  .digit-column {
    height: 2.5rem;
    line-height: 2.5rem;
    width: 1.5rem;
  }
}

.digit-ribbon {
  position: relative;
  will-change: transform;
}

.digit-item {
  height: 1.75rem;
  line-height: 1.75rem;
}

@media (min-width: 1024px) {
  .digit-item {
    height: 2.5rem;
    line-height: 2.5rem;
  }
}
</style>
