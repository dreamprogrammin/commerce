<script setup lang="ts">
import { useSlides } from '@/composables/slides/useSlides'
import { carouselContainerVariants } from '@/lib/variants'
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const recommendationsStore = useRecommendationsStore()
const personalizationStore = usePersonalizationStore()
const productsStore = useProductsStore()
const wishlistStore = useWishlistStore()
const { slides, isLoading: isLoadingSlides, error: slidesError } = useSlides()

const { isLoggedIn, user } = storeToRefs(authStore)
const { isAdmin } = storeToRefs(profileStore)
const { trigger: personalizationTrigger } = storeToRefs(personalizationStore)

const alwaysContainedClass = carouselContainerVariants({ contained: 'always' })

const { data: mainPersonalData, pending: isLoadingRecommendations } = useAsyncData(
  'home-recommendations',
  async () => {
    const [recommended, wishlist] = await Promise.all([
      recommendationsStore.fetchRecommendations(),
      isLoggedIn.value ? wishlistStore.fetchWishlistProducts() : [],
    ])

    return {
      recommended: recommended || [],
      wishlist: Array.isArray(wishlist) ? wishlist : [],
    }
  },
  {
    watch: [user, personalizationTrigger, isLoggedIn],
    lazy: true,
    default: () => ({ recommended: [], wishlist: [] }),
  },
)

const recommendedProducts = computed(() => mainPersonalData.value.recommended)
const wishlistProducts = computed(() => mainPersonalData.value.wishlist)

const { data: popularProducts, pending: isLoadingPopular } = useAsyncData(
  'home-popular',
  () => productsStore.fetchPopularProducts(10),
  { lazy: true, default: () => [] },
)

const { data: newestProducts, pending: isLoadingNewest } = useAsyncData(
  'home-newest',
  () => productsStore.fetchNewestProducts(10),
  { lazy: true, default: () => [] },
)

const isLoadingMainBlock = computed(() => isLoadingRecommendations.value || isLoadingPopular.value)
</script>

<template>
  <div>
    <!-- Блок приветствия/авторизации -->
    <div :class="alwaysContainedClass" class="py-4">
      <ClientOnly>
        <div v-if="isLoggedIn" class="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <NuxtLink v-if="isAdmin" to="/admin" class="font-semibold text-primary hover:underline">
            Перейти в панель администратора
          </NuxtLink>
          <NuxtLink v-else to="/profile" class="font-semibold text-primary hover:underline">
            Перейти в личный кабинет
          </NuxtLink>
        </div>
        <div v-else class="p-4 bg-gray-100 border rounded-md">
          <NuxtLink to="/profile" class="font-semibold text-primary hover:underline">
            Пожалуйста, авторизуйтесь, чтобы получать бонусы!
          </NuxtLink>
        </div>
        <template #fallback>
          <div class="p-4 bg-gray-100 border rounded-md animate-pulse">
            <div class="h-5 w-1/3 bg-gray-200 rounded" />
          </div>
        </template>
      </ClientOnly>
    </div>

    <!-- Слайдер -->
    <CommonAppCarousel
      :is-loading="isLoadingSlides"
      :error="slidesError"
      :slides="slides || []"
    />

    <!-- 🆕 Баннеры (сразу после слайдера) -->
    <div :class="alwaysContainedClass">
      <HomeBanners />
    </div>

    <!-- Популярные категории -->
    <div :class="alwaysContainedClass">
      <HomePopularCategories />
    </div>

    <!-- Карточки бонусов и избранного -->
    <div :class="alwaysContainedClass" class="py-8 md:py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        <HomeBonusProgramCard />
        <HomeFeaturedProduct />
      </div>
    </div>

    <!-- Карусели товаров -->
    <ClientOnly>
      <!-- Скелетон -->
      <div v-if="isLoadingMainBlock" :class="alwaysContainedClass" class="py-8 md:py-12">
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>

      <template v-else>
        <!-- Избранное -->
        <HomeProductsCarousel
          v-if="isLoggedIn && wishlistProducts.length > 0"
          :is-loading="isLoadingRecommendations"
          :products="wishlistProducts"
          title="Ваше избранное"
          see-all-link="/profile/wishlist"
          class="mt-16 pt-8 border-t"
        />

        <!-- Рекомендации -->
        <HomeProductsCarousel
          v-if="recommendedProducts && recommendedProducts.length > 0"
          :is-loading="isLoadingRecommendations"
          :products="recommendedProducts"
          title="Вам может понравиться"
          see-all-link="/catalog/all?recommended=true"
          :class="{ 'mt-16 pt-8 border-t': !isLoggedIn || wishlistProducts.length === 0 }"
        />

        <!-- Популярные товары (fallback) -->
        <HomeProductsCarousel
          v-else
          :is-loading="isLoadingPopular"
          :products="popularProducts"
          title="Популярные товары"
          see-all-link="/catalog/all?sort_by=popularity"
          class="mt-16 pt-8 border-t"
        />
      </template>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div :class="alwaysContainedClass" class="py-8 md:py-12">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- Новые поступления -->
    <ClientOnly>
      <HomeProductsCarousel
        v-if="newestProducts && newestProducts.length > 0"
        :is-loading="isLoadingNewest"
        :products="newestProducts"
        title="Новые поступления"
        see-all-link="/catalog/all?sort_by=newest"
        class="pt-4 border-t"
      />

      <!-- Скелетон для новинок -->
      <div v-else-if="isLoadingNewest" :class="alwaysContainedClass" class="py-8 md:py-12">
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div :class="alwaysContainedClass" class="py-8 md:py-12">
          <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
