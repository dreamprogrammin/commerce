<script setup lang="ts">
import HomeNewArrivals from '@/components/home/HomeNewArrivals.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/core/profileStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const { isLoggedIn } = storeToRefs(authStore)

const { isAdmin } = storeToRefs(profileStore)

const hasPersonalizationData = computed(() => {
  return isLoggedIn.value && profileStore.profile
})

onMounted(() => {
  if (isLoggedIn.value && !profileStore.profile) {
    profileStore.loadProfile()
  }
})
</script>

<template>
  <div>
    <!-- Обязательная корневая обертка -->
    <h1 class="text-3xl font-bold mb-4">
      Добро пожаловать в наш магазин
    </h1>

    <ClientOnly>
      <!--
        Используем `isLoggedIn` из стора для проверки.
        Это немного чище, чем `v-if="user"`.
      -->
      <div v-if="isLoggedIn" class="p-4 mb-6 bg-blue-50 border border-blue-200 rounded-md">
        <!--
          Показываем ссылку на админку ТОЛЬКО если пользователь - админ.
          `isAdmin` - это наш computed-флаг из `profileStore`.
        -->
        <NuxtLink v-if="isAdmin" to="/admin" class="font-semibold text-primary hover:underline">
          Перейти в панель администратора
        </NuxtLink>

        <!-- Для обычных пользователей можно показать ссылку на профиль -->
        <NuxtLink v-else to="/profile" class="font-semibold text-primary hover:underline">
          Перейти в личный кабинет
        </NuxtLink>
      </div>

      <!-- Блок для гостей -->
      <div v-else class="p-4 mb-6 bg-gray-100 border rounded-md">
        <NuxtLink to="/profile" class="font-semibold text-primary hover:underline">
          Пожалуйста, авторизуйтесь, чтобы получать бонусы!
        </NuxtLink>
      </div>

      <!-- Заглушка для серверного рендеринга -->
      <template #fallback>
        <div class="p-4 mb-6 bg-gray-100 border rounded-md animate-pulse">
          <div class="h-5 w-1/3 bg-gray-200 rounded" />
        </div>
      </template>
    </ClientOnly>

    <!-- Твои остальные компоненты главной страницы -->
    <CommonAppCarousel />
    <HomePopularCategories />

    <div class="container py-8 md:py-12">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
        <HomeBonusProgramCard />
        <HomeFeaturedProduct />
      </div>
    </div>

    <HomeRecommendedProducts v-if="hasPersonalizationData" />
    <HomeNewArrivals />
  </div>
</template>
