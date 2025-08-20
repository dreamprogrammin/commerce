<script setup lang="ts">
import { useAuth } from '@/composables/auth/useAuth'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useProfileStore } from '@/stores/profile'

const { handleAuthGoogle, handleOut } = useAuth()
const profileStore = useProfileStore()
const user = useSupabaseUser()

definePageMeta({
  layout: 'profile',
})
const { isLoading, displayProfile } = storeToRefs(profileStore)
const displayName = computed(() => {
  if (!user.value) {
    return 'Гость'
  }

  if (displayProfile.value) {
    const fullName = [
      displayProfile.value?.first_name,
      displayProfile.value?.last_name,
    ].filter(Boolean)
    if (fullName) {
      return fullName
    }
  }
  return user.value.email || 'Пользователь'
})
const modalStore = useModalStore()
</script>

<template>
  <h1>Настройки профиля</h1>

  <ClientOnly>
    <!-- Блок для гостя (если user=null) -->
    <div v-if="!user">
      <h2>Привет, Гость!</h2>
      <p>Войдите, чтобы управлять своим профилем.</p>
      <button @click="handleAuthGoogle">
        Войти через Google
      </button>
    </div>

    <!-- Блок для залогиненного пользователя (если user существует) -->
    <div v-else>
      <!-- Состояние загрузки. Оно не зависит от displayName -->
      <div v-if="isLoading">
        <p>Загрузка данных профиля...</p>
        <!-- Можно добавить скелетон или спиннер -->
      </div>

      <!-- Состояние, когда загрузка завершена. -->
      <!-- Теперь неважно, есть ли профиль, мы покажем контент -->
      <div v-else>
        <!-- displayName всегда вернет корректное значение -->
        <h2>Добро пожаловать, {{ displayName }}!</h2>

        <p>Ваш email: {{ user.email }}</p>
        <p>Ваши бонусы: {{ profileStore.bonusBalance }} ✨</p>

        <button class="mt-4" @click="handleOut">
          Выйти из аккаунта
        </button>
      </div>
    </div>

    <template #fallback>
      <div>Загрузка...</div>
    </template>
  </ClientOnly>
</template>
