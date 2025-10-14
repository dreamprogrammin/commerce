<script setup lang="ts">
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const recommendationsStore = useRecommendationsStore()
const personalizationStore = usePersonalizationStore()
const productsStore = useProductsStore()

const { isLoggedIn, user } = storeToRefs(authStore)
const { isAdmin } = storeToRefs(profileStore)
const { trigger: personalizationTrigger } = storeToRefs(personalizationStore)

const { data: recommendedProducts, pending: isLoadingRecommendations } = useAsyncData(
  'home-recommendations',
  async () => {
    return await recommendationsStore.fetchRecommendations()
  },
  {
    watch: [user, personalizationTrigger],
    lazy: true,
    default: () => [],
  },
)

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

const shouldShowRecommendations = computed(() => {
  return recommendedProducts.value && recommendedProducts.value.length > 0
})

const isLoadingMainBlock = computed(() => isLoadingRecommendations.value || isLoadingPopular.value)
</script>

<template>
  <div>
    <!-- Блок приветствия/авторизации -->
    <div class="container py-4">
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
    <CommonAppCarousel />
    <HomePopularCategories />

    <!-- Секция с карточками Бонусов и Товара дня -->
    <div class="container py-8 md:py-12">
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
      <div v-if="isLoadingMainBlock" class="container py-8 md:py-12">
        <!-- Заголовок меняется в зависимости от того, залогинен ли юзер -->
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <ProductCarouselSkeleton />
      </div>

      <!-- Если все загрузки завершены, принимаем решение, что показать -->
      <template v-else>
        <HomeProductsCarousel
          v-if="shouldShowRecommendations"
          :is-loading="isLoadingRecommendations"
          :products="recommendedProducts"
          title="Вам может понравиться"
          see-all-link="/catalog/all?recommended=true"
        />
        <HomeProductsCarousel
          v-else
          :is-loading="isLoadingPopular"
          :products="popularProducts"
          title="Популярные товары"
          see-all-link="/catalog/all?sort_by=popularity"
        />
      </template>

      <!-- Заглушка для серверного рендеринга (всегда показываем популярные) -->
      <template #fallback>
        <Skeleton class="h-8 w-1/3 mb-8 rounded-lg" />
        <div class="container py-8 md:py-12">
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
