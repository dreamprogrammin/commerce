<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const productStore = useProductsStore()
const { getVariantUrl } = useSupabaseStorage()

const { data: products, pending: isLoading } = useAsyncData(
  'featured-products',
  () => productStore.fetchFeaturedProducts(),
  {
    lazy: true,
    // ✅ Используем getCachedData для использования кеша
    getCachedData(key) {
      const data = useNuxtData(key)
      return data.data.value
    },
  },
)

// ✅ Показываем skeleton только если идёт загрузка И данных нет
const showSkeleton = computed(() => isLoading.value && !products.value)

const currentSlide = ref(0)
const emblaApi = ref<any>(null)

function onCarouselInit(api: any) {
  emblaApi.value = api
  if (api) {
    currentSlide.value = api.selectedScrollSnap()
    api.on('select', () => {
      currentSlide.value = api.selectedScrollSnap()
    })
  }
}

const productsList = computed(() => {
  if (!products.value)
    return []
  return Array.isArray(products.value) ? products.value : [products.value]
})

function getMainImage(product: any) {
  return product?.product_images?.[0] ?? null
}

function getMainImageVariant(product: any, variant: 'sm' | 'md' | 'lg') {
  const img = getMainImage(product)
  if (!img?.image_url)
    return null
  return getVariantUrl(BUCKET_NAME_PRODUCT, img.image_url, variant)
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'KZT',
    minimumFractionDigits: 0,
  }).format(price)
}
</script>

<template>
  <div class="relative">
    <!-- Loading State - только если идёт загрузка И данных нет -->
    <div
      v-if="showSkeleton"
      class="relative overflow-hidden rounded-xl bg-card border border-border p-3 shadow-sm"
    >
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Skeleton class="size-8 rounded-lg" />
            <Skeleton class="h-4 w-16" />
          </div>
          <Skeleton class="h-7 w-12 rounded-lg" />
        </div>
        <Skeleton class="aspect-square rounded-lg" />
        <Skeleton class="h-4 w-2/3" />
        <Skeleton class="h-6 w-24" />
        <Skeleton class="h-9 w-full rounded-lg" />
      </div>
    </div>

    <!-- Products Carousel -->
    <div
      v-else-if="productsList.length > 0"
      class="relative overflow-hidden rounded-xl bg-card border border-border shadow-sm hover:shadow-md transition-shadow duration-300"
    >
      <Carousel
        class="w-full"
        :opts="{
          align: 'center',
          loop: true,
        }"
        @init-api="onCarouselInit"
      >
        <CarouselContent>
          <CarouselItem v-for="product in productsList" :key="product.id">
            <div class="p-3 sm:p-4">
              <!-- Header -->
              <div class="flex items-center justify-between mb-2 sm:mb-3">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    class="w-8 h-8 sm:w-9 sm:h-9 bg-gradient-to-br from-orange-500 to-red-600 rounded-lg flex items-center justify-center flex-shrink-0"
                  >
                    <Icon
                      name="lucide:flame"
                      class="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <h3
                      class="text-sm sm:text-base font-bold text-foreground"
                    >
                      Товар дня
                    </h3>
                  </div>
                </div>

                <!-- Timer -->
                <div
                  class="flex items-center gap-1 bg-destructive/10 rounded-lg px-2 py-1 border border-destructive/20 flex-shrink-0"
                >
                  <Icon
                    name="lucide:timer"
                    class="size-3 text-destructive"
                  />
                  <span class="text-xs font-bold text-destructive">23:59</span>
                </div>
              </div>

              <!-- Main Content -->
              <div
                class="flex flex-col gap-2 sm:grid sm:grid-cols-2 sm:gap-3"
              >
                <!-- Product Image -->
                <NuxtLink
                  :to="`/catalog/products/${product.slug}`"
                  class="block group relative"
                >
                  <div
                    class="relative w-full aspect-square bg-muted rounded-lg overflow-hidden border border-border group-hover:shadow-md transition-all duration-300"
                  >
                    <!-- Badges -->
                    <div class="absolute top-2 left-2 z-10 flex flex-col gap-1">
                      <div
                        v-if="product.discount_percentage > 0"
                        class="bg-red-500 text-white px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-0.5"
                      >
                        <Icon name="lucide:zap" class="w-2.5 h-2.5" />
                        -{{ product.discount_percentage }}%
                      </div>
                      <div
                        class="bg-blue-500 text-white px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-0.5"
                      >
                        <Icon name="lucide:gift" class="w-2.5 h-2.5" />
                        +{{ product.bonus_points_award }}
                      </div>
                    </div>

                    <ProgressiveImage
                      :src="getMainImageVariant(product, 'sm')"
                      :src-mobile="getMainImageVariant(product, 'sm')"
                      :src-mobile-sm="getMainImageVariant(product, 'sm')"
                      :src-sm="getMainImageVariant(product, 'lg')"
                      :src-md="getMainImageVariant(product, 'lg')"
                      :src-lg="getMainImageVariant(product, 'lg')"
                      :blur-data-url="getMainImage(product)?.blur_placeholder"
                      :alt="product.name"
                      object-fit="contain"
                      :placeholder-type="
                        getMainImage(product)?.blur_placeholder
                          ? 'lqip'
                          : 'shimmer'
                      "
                      :zoom-on-hover="true"
                      class="absolute inset-0"
                    />
                  </div>
                </NuxtLink>

                <!-- Product Info -->
                <div class="flex flex-col gap-2 min-h-[260px] sm:min-h-0">
                  <div class="flex flex-col gap-1.5 flex-1">
                    <!-- Category -->
                    <div class="h-6">
                      <div
                        v-if="product.categories"
                        class="inline-flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded text-xs font-semibold text-muted-foreground"
                      >
                        <Icon
                          name="lucide:tag"
                          class="size-2.5 text-primary"
                        />
                        {{ product.categories.name }}
                      </div>
                    </div>

                    <!-- Name -->
                    <NuxtLink
                      :to="`/catalog/products/${product.slug}`"
                      class="block group"
                    >
                      <h4
                        class="text-sm sm:text-base font-bold text-foreground group-hover:text-primary transition-colors line-clamp-2 leading-tight mb-2"
                      >
                        {{ product.name }}
                      </h4>
                    </NuxtLink>

                    <!-- Price -->
                    <div class="flex flex-col gap-1">
                      <!-- Old Price -->
                      <div class="h-5 flex items-center">
                        <div
                          v-if="product.discount_percentage > 0"
                          class="flex items-center gap-1"
                        >
                          <span class="text-xs text-muted-foreground line-through">
                            {{ formatPrice(product.price) }}
                          </span>
                          <span
                            class="bg-destructive/10 text-destructive px-1 py-0.5 rounded text-xs font-bold"
                          >
                            -{{ product.discount_percentage }}%
                          </span>
                        </div>
                      </div>

                      <!-- Current Price -->
                      <div class="h-8 flex items-center">
                        <span
                          class="text-xl sm:text-2xl font-black text-foreground"
                        >
                          {{
                            formatPrice(product.final_price || product.price)
                          }}
                        </span>
                      </div>

                      <!-- Cashback -->
                      <div
                        class="flex items-center gap-1.5 p-1.5 bg-primary/10 rounded-lg border border-primary/20 h-9"
                      >
                        <div
                          class="size-6 bg-primary rounded flex items-center justify-center flex-shrink-0"
                        >
                          <Icon
                            name="lucide:coins"
                            class="size-3 text-primary-foreground"
                          />
                        </div>
                        <div class="flex-1 min-w-0">
                          <p
                            class="text-xs font-bold text-primary"
                          >
                            +{{ product.bonus_points_award }}&nbsp;₸
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Actions -->
                  <div class="flex flex-col gap-1.5">
                    <Button
                      as-child
                      class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-sm font-bold shadow-sm"
                    >
                      <NuxtLink
                        :to="`/catalog/products/${product.slug}`"
                        class="flex items-center justify-center gap-1"
                      >
                        <Icon name="lucide:shopping-cart" class="size-3.5" />
                        Купить
                      </NuxtLink>
                    </Button>
                    <div class="grid grid-cols-2 gap-1.5">
                      <div
                        class="border border-border rounded-lg h-9 flex items-center justify-center hover:bg-accent transition-colors"
                      >
                        <ProductWishlistButton
                          :product-id="product.id"
                          :product-name="product.name"
                        />
                      </div>
                      <Button
                        as-child
                        variant="outline"
                        class="rounded-lg h-9 text-xs font-semibold"
                      >
                        <NuxtLink
                          :to="`/catalog/products/${product.slug}`"
                          class="flex items-center justify-center gap-1"
                        >
                          <Icon name="lucide:info" class="size-3" />
                          <span class="hidden sm:inline">Еще</span>
                        </NuxtLink>
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CarouselItem>
        </CarouselContent>

        <!-- Navigation -->
        <div
          v-if="productsList.length > 1"
          class="flex items-center justify-center gap-2 pb-2"
        >
          <div class="flex gap-1">
            <button
              v-for="(_, index) in productsList"
              :key="index"
              class="h-1 rounded-full transition-all duration-300"
              :class="
                currentSlide === index
                  ? 'w-5 bg-primary'
                  : 'w-1 bg-border'
              "
              @click="emblaApi?.scrollTo(index)"
            />
          </div>
        </div>
      </Carousel>
    </div>

    <!-- Empty State -->
    <div
      v-else
      class="relative overflow-hidden rounded-xl bg-card border-2 border-dashed border-border p-6"
    >
      <div
        class="flex flex-col items-center justify-center text-center gap-2"
      >
        <div
          class="size-12 bg-muted rounded-lg flex items-center justify-center"
        >
          <Icon name="lucide:gift" class="size-6 text-muted-foreground" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-foreground mb-1">
            Готовим предложение
          </h3>
          <p class="text-xs text-muted-foreground">
            Скоро появится товар с выгодой
          </p>
        </div>
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
  @keyframes bounce {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  .animate-bounce {
    animation: bounce 1.5s infinite;
  }
}
</style>
