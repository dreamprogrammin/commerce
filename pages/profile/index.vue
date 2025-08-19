<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

// --- Инициализация сторов ---
const authStore = useAuthStore()
const profileStore = useProfileStore()

// --- Реактивные данные ---
const { user } = storeToRefs(authStore)
const { profile, fullName, bonusBalance, isLoading } = storeToRefs(profileStore)

// --- Метаданные страницы БЕЗ middleware ---
definePageMeta({
  layout: 'profile',
})

// --- SEO ---
useHead({
  title: 'Мой профиль',
})

// --- Загружаем профиль при монтировании ---
onMounted(async () => {
  if (user.value) {
    await profileStore.loadProfile()
  }
})
</script>

<template>
  <div>
    <h1 class="text-3xl font-bold mb-6">
      Настройки профиля
    </h1>

    <!-- Проверяем авторизацию прямо в шаблоне -->
    <div v-if="!user">
      <div class="text-center space-y-4">
        <h2 class="text-xl">
          Войдите в систему
        </h2>
        <p>Для просмотра профиля необходимо войти в систему</p>
        <Button @click="authStore.signInWithOAuth('google')">
          Войти через Google
        </Button>
      </div>
    </div>

    <!-- Авторизованный пользователь -->
    <div v-else>
      <!-- Загрузка -->
      <div v-if="isLoading" class="space-y-4">
        <Skeleton class="h-8 w-1/2" />
        <Skeleton class="h-4 w-3/4" />
        <Skeleton class="h-4 w-2/3" />
      </div>

      <!-- Профиль загружен -->
      <div v-else-if="profile" class="space-y-4">
        <h2 class="text-2xl font-semibold">
          Добро пожаловать, {{ fullName }}!
        </h2>

        <div class="space-y-2">
          <p><strong>Email:</strong> {{ user.email }}</p>
          <p><strong>Телефон:</strong> {{ profile.phone || 'Не указан' }}</p>
          <p>
            <strong>Ваши бонусы:</strong>
            <span class="font-bold text-primary">{{ bonusBalance }} ✨</span>
          </p>
        </div>

        <div class="flex gap-4 mt-6">
          <Button variant="outline" @click="profileStore.loadProfile()">
            Обновить данные
          </Button>
          <Button variant="destructive" @click="authStore.signOut()">
            Выйти из аккаунта
          </Button>
        </div>
      </div>

      <!-- Ошибка загрузки профиля -->
      <div v-else class="text-center space-y-4">
        <p class="text-destructive">
          Не удалось загрузить данные профиля
        </p>
        <Button @click="profileStore.loadProfile()">
          Попробовать снова
        </Button>
      </div>
    </div>
  </div>
</template>
