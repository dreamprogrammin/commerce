<script setup lang="ts">
import type { IBreadcrumbItem, ProductWithImages } from '@/types'
import { toast } from 'vue-sonner'
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

const { data, pending: isLoading } = useAsyncData(
  `product-page-${slug.value}`,
  async () => {
    await categoriesStore.fetchCategoryData()
    selectedAccessoryIds.value = []

    const fetchedProduct = await productsStore.fetchProductBySlug(slug.value)

    if (!fetchedProduct) {
      return { product: null, accessories: [], similarProducts: [] }
    }

    let fetchedAccessories: ProductWithImages[] = []
    let fetchedSimilarProducts: ProductWithImages[] = []

    await Promise.all([
      (async () => {
        if (fetchedProduct.accessory_ids && fetchedProduct.accessory_ids.length > 0) {
          fetchedAccessories = await productsStore.fetchProductsByIds(fetchedProduct.accessory_ids)
        }
      })(),
      (async () => {
        if (fetchedProduct.category_id) {
          // ✅ Загружаем и кэшируем бренды и атрибуты для похожих товаров
          const categorySlug = fetchedProduct.categories?.slug
          if (categorySlug) {
            await Promise.all([
              productsStore.fetchBrandsForCategory(categorySlug),
              productsStore.fetchAttributesForCategory(categorySlug),
              productsStore.fetchAllMaterials(),
              productsStore.fetchAllCountries(),
            ])
          }

          const excludeIds = [fetchedProduct.id, ...fetchedProduct.accessory_ids || []]
          fetchedSimilarProducts = await productsStore.fetchSimilarProducts(
            fetchedProduct.category_id,
            excludeIds,
          )
        }
      })(),
    ])

    return {
      product: fetchedProduct,
      accessories: fetchedAccessories,
      similarProducts: fetchedSimilarProducts,
    }
  },
  {
    watch: [slug],
    lazy: true,
  },
)

const product = computed(() => data.value?.product)
const accessories = computed(() => data.value?.accessories || [])
const similarProducts = computed(() => data.value?.similarProducts || [])
const digitColumns = ref<HTMLElement[]>([])

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

watch(isLoading, (newIsLoading) => {
  if (newIsLoading === false && !product.value) {
    showError({ statusCode: 404, statusMessage: 'Товар не найден', fatal: true })
  }
})

useHead(() => ({
  title: product.value?.name || 'Загрузка товара...',
  meta: [
    { name: 'description', content: product.value?.description || `Купить ${product.value?.name || 'товар'} в нашем интернет-магазине.` },
  ],
}))

const quantity = ref(1)

watch(() => product.value?.id, () => {
  quantity.value = 1
}, { immediate: true })
</script>

<template>
  <div :class="`${containerClass} py-12`">
    <ClientOnly>
      <ProductDetailSkeleton v-if="isLoading" />

      <div v-else-if="product">
        <Breadcrumbs :items="breadcrumbs" class="mb-6" />
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          <div class="lg:col-span-8 top-24">
            <ProductGallery
              v-if="product.product_images && product.product_images.length > 0"
              :images="product.product_images"
            />

            <div v-else class="bg-muted rounded-lg flex items-center justify-center h-full">
              <p class="text-muted-foreground">
                Изображения отсутствуют
              </p>
            </div>

            <div class="mt-16 pt-8 border-t">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div class="md:col-span-2">
                  <ProductDescription v-if="product.description" :description="product.description" />
                </div>
                <div>
                  <ProductFeatures :product="product" />
                </div>
              </div>
            </div>
          </div>

          <div class="lg:col-span-4 sticky top-24">
            <div class="space-y-6">
              <NuxtLink v-if="product.categories" :to="`/catalog/${product.categories.slug}`" class="text-sm text-muted-foreground hover:text-primary transition-colors">
                {{ product.categories.name }}
              </NuxtLink>
              <h1 class="text-3xl lg:text-4xl font-bold mt-1">
                {{ product.name }}
              </h1>
            </div>
            <p class="text-4xl font-bold">
              {{ product.price }} ₸
            </p>

            <div v-if="accessories.length > 0" class="pt-4 border-t">
              <h3 class="font-semibold mb-3">
                С этим товаром покупают:
              </h3>
              <div class="space-y-3">
                <div
                  v-for="acc in accessories"
                  :key="acc.id"
                  class="flex items-center justify-between p-2 rounded-md border cursor-pointer select-none transition-colors has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-muted hover:bg-muted/50"
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
                  <div class="flex items-center gap-3">
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
                    <div class="w-12 h-12 bg-muted rounded-md overflow-hidden flex-shrink-0">
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
                    <span class="text-sm font-medium leading-none">
                      {{ acc.name }}
                    </span>
                  </div>
                  <span class="text-sm font-semibold whitespace-nowrap">+ {{ acc.price }} ₸</span>
                </div>
              </div>
            </div>

            <div :key="`price-${product.id}`" class="pt-4 border-t">
              <div class="flex justify-between items-baseline">
                <span class="text-lg font-medium">Общая стоимость:</span>
                <div class="text-4xl font-bold flex items-center gap-0.5">
                  <div
                    v-for="(digit, i) in String(Math.round(totalPrice)).split('')"
                    :key="`digit-${i}`"
                    :ref="el => { if (el) digitColumns[i] = el as HTMLElement }"
                    class="digit-column"
                  >
                    <div class="digit-ribbon">
                      <div v-for="d in 10" :key="d" class="digit-item">
                        {{ d - 1 }}
                      </div>
                    </div>
                  </div>
                  <span class="ml-2">₸</span>
                </div>
              </div>
            </div>

            <div class="p-4 bg-primary/10 text-primary rounded-lg border border-primary/20">
              При покупке вы получите <span class="font-bold">{{ totalBonuses }} бонусов</span>
            </div>
            <ClientOnly>
              <div class="flex items-center gap-4 pt-4">
                <template v-if="product.stock_quantity > 0">
                  <Button
                    v-if="!mainItemInCart"
                    size="lg"
                    class="flex-grow"
                    @click="addToCart"
                  >
                    Добавить в корзину
                  </Button>

                  <template v-else>
                    <Button
                      size="lg"
                      class="flex-grow"
                      variant="outline"
                      @click="router.push('/cart')"
                    >
                      Перейти в корзину
                    </Button>

                    <QuantitySelector
                      :product="product"
                      :quantity="quantityInCart"
                      class="w-1/3"
                    />
                  </template>
                </template>

                <Button v-else size="lg" class="flex-grow" disabled>
                  Нет в наличии
                </Button>
              </div>
            </ClientOnly>
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
  <ProductCarousel v-if="similarProducts.length > 0" :products="similarProducts" class="mt-16 pt-8 border-t">
    <template #header>
      <h2 class="text-2xl font-bold mb-6">
        Похожие товары
      </h2>
    </template>
  </ProductCarousel>
</template>

<style scoped>
.digit-column {
  height: 2.5rem;
  line-height: 2.5rem;
  overflow: hidden;
  position: relative;
  width: 1.5rem;
  text-align: center;
  border-radius: 0.25rem;
  transition: background-color 0.3s ease;
}

.digit-ribbon {
  position: relative;
  will-change: transform;
}

.digit-item {
  height: 2.5rem;
  line-height: 2.5rem;
}
</style>
