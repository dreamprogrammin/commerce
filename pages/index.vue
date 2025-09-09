<script setup lang="ts">
import HomeNewArrivals from '@/components/home/HomeNewArrivals.vue'
import { useAuthStore } from '@/stores/auth'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const recommendationsStore = useRecommendationsStore()
const personalizationStore = usePersonalizationStore()

const { isLoggedIn, user } = storeToRefs(authStore)
const { isAdmin } = storeToRefs(profileStore)
const { hasPersonalizedRecommendations } = storeToRefs(recommendationsStore)
const { trigger: personalizationTrigger } = storeToRefs(personalizationStore)

const shouldShowRecommendations = computed(() => {
  return hasPersonalizedRecommendations.value
})

recommendationsStore.fetchRecommendationsIfNeeded()

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
      <!-- Пока идет проверка/загрузка рекомендаций, показываем скелетон -->
      <div v-if="isLoadingRecommendations" class="container py-8 md:py-12">
        <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
          Подбираем лучшие предложения...
        </h2>
        <ProductCarouselSkeleton />
      </div>

      <!-- Если загрузка завершена, показываем либо одно, либо другое -->
      <template v-else>
        <HomeRecommendedProducts v-if="shouldShowRecommendations" :products="recommendedProducts" />
        <HomePopularProducts v-else />
      </template>

      <!-- Заглушка для серверного рендеринга -->
      <template #fallback>
        <div class="container py-8 md:py-12">
          <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
            Популярные товары
          </h2>
          <ProductCarouselSkeleton />
        </div>
      </template>
    </ClientOnly>

    <!-- Секция Новинок -->
    <HomeNewArrivals />
  </div>
</template>
