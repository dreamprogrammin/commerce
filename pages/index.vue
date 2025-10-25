<script setup lang="ts">
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

const { isLoggedIn, user } = storeToRefs(authStore)
const { isAdmin } = storeToRefs(profileStore)
const { trigger: personalizationTrigger } = storeToRefs(personalizationStore)

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

// 3. Загрузка Новинок
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
    <div class="app-container py-4">
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

    <!-- Основной контент главной страницы -->
    <CommonAppCarousel class="app-container" />
    <HomePopularCategories class="app-container" />

    <!-- Секция с карточками Бонусов и Товара дня -->
    <div class="app-container py-8 md:py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        <HomeBonusProgramCard />
        <HomeFeaturedProduct />
      </div>
    </div>

    <!--
      Секция Рекомендаций / Популярных товаров.
      Она динамически переключается в зависимости от пользователя.
    -->
    <ClientOnly>
      <!-- Пока ЛЮБАЯ из загрузок активна, показываем ОДИН общий скелетон -->
      <div v-if="isLoadingMainBlock" class="app-container py-8 md:py-12">
        <!-- Заголовок меняется в зависимости от того, залогинен ли юзер -->
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>

      <!-- Если все загрузки завершены, принимаем решение, что показать -->
      <template v-else>
        <!-- Секция 1: ИЗБРАННОЕ (САМЫЙ ВЫСОКИЙ ПРИОРИТЕТ ДЛЯ ЛОЯЛЬНЫХ) -->
        <!-- Секция 1: ИЗБРАННОЕ -->
        <HomeProductsCarousel
          v-if="isLoggedIn && wishlistProducts.length > 0"
          :is-loading="isLoadingRecommendations"
          :products="wishlistProducts"
          title="Ваше избранное"
          see-all-link="/profile/wishlist"
          class="mt-16 pt-8 border-t"
        />

        <!-- Секция 2: РЕКОМЕНДАЦИИ -->
        <HomeProductsCarousel
          v-if="recommendedProducts && recommendedProducts.length > 0"
          :is-loading="isLoadingRecommendations"
          :products="recommendedProducts"
          title="Вам может понравиться"
          see-all-link="/catalog/all?recommended=true"
          :class="{ 'mt-16 pt-8 border-t': !isLoggedIn || wishlistProducts.length === 0 }"
        />

        <!-- Секция 3: Популярные товары (как резерв) -->
        <HomeProductsCarousel
          v-else
          :is-loading="isLoadingPopular"
          :products="popularProducts"
          title="Популярные товары"
          see-all-link="/catalog/all?sort_by=popularity"
          class="mt-16 pt-8 border-t"
        />
      </template>

      <!-- Заглушка для серверного рендеринга (всегда показываем популярные) -->
      <template #fallback>
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <div class="app-container py-8 md:py-12">
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- Секция Новинок (самодостаточный компонент) -->
    <HomeProductsCarousel
      :is-loading="isLoadingNewest"
      :products="newestProducts"
      title="Новые поступления"
      see-all-link="/catalog/all?sort_by=newest"
    />
  </div>
</template>
