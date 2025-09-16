<script setup lang="ts">
import HomeNewArrivals from '@/components/home/HomeNewArrivals.vue'
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
  'home-popular-products',
  () => productsStore.fetchPopularProducts(10),
  {
    lazy: true,
    default: () => [],
  },
)

const shouldShowRecommendations = computed(() => {
  return recommendedProducts.value && recommendedProducts.value.length > 0
})

const isLoading = computed(() => isLoadingRecommendations.value || isLoadingPopular.value)
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
      <div v-if="isLoading" class="container py-8 md:py-12">
        <!-- Заголовок меняется в зависимости от того, залогинен ли юзер -->
        <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
          {{ isLoggedIn ? 'Подбираем лучшие предложения...' : 'Популярные товары' }}
        </h2>
        <ProductCarouselSkeleton />
      </div>

      <!-- Если все загрузки завершены, принимаем решение, что показать -->
      <template v-else>
        <HomeProductsCarousel
          v-if="shouldShowRecommendations"
          type="recommended"
          title="Вам может понравится"
        />
        <HomeProductsCarousel
          v-else
          type="popular"
          title="Популярные товары"
        />
      </template>

      <!-- Заглушка для серверного рендеринга (всегда показываем популярные) -->
      <template #fallback>
        <div class="container py-8 md:py-12">
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- Секция Новинок (самодостаточный компонент) -->
    <HomeProductsCarousel type="newest" title="Новые поступления" />
  </div>
</template>
