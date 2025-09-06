<script setup lang="ts">
import { toast } from 'vue-sonner'
import HomeNewArrivals from '@/components/home/HomeNewArrivals.vue'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/core/profileStore'

// --- 1. Инициализация сторов ---
const authStore = useAuthStore()
const profileStore = useProfileStore()

// --- 2. Получаем реактивные данные ---
// `user` - информация об аутентификации из authStore.
// `isLoggedIn` - удобный computed, который мы добавим.
const { user, isLoggedIn } = storeToRefs(authStore)

// `isAdmin` - computed из profileStore, который проверяет роль пользователя.
const { isAdmin } = storeToRefs(profileStore)

// `loadProfile` может понадобиться, если пользователь восстановил сессию
const { loadProfile } = profileStore

// `onMounted` убедится, что профиль загружен, если пользователь уже был залогинен
onMounted(() => {
  if (user.value && !profileStore.profile) {
    loadProfile()
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

    <HomeRecommendedProducts />
    <HomeNewArrivals />
  </div>
</template>
