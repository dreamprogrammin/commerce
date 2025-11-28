<script setup lang="ts">
import { Toaster } from 'vue-sonner'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useAuthStore } from './stores/auth'
import { useProductsStore } from './stores/publicStore/productsStore'
import 'vue-sonner/style.css'

useAuthStore()
useProductsStore()
const modalStore = useModalStore()

useHead({
  htmlAttrs: {
    lang: 'ru',
  },
  link: [
    { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
  ],
})

useSeoMeta({
  title: 'Кракен Шоп - Магазин детских игрушек',
  description: 'Лучшие игрушки для ваших детей! Развивающие игры, конструкторы, куклы и многое другое.',
  ogTitle: 'Кракен Шоп - Магазин детских игрушек',
  ogDescription: 'Лучшие игрушки для ваших детей! Развивающие игры, конструкторы, куклы и многое другое.',
})

// 🆕 Управление LoadingBar при навигации
const nuxtApp = useNuxtApp()
const isPageLoading = ref(false)

nuxtApp.hook('page:start', () => {
  isPageLoading.value = true
})

nuxtApp.hook('page:finish', () => {
  // Небольшая задержка для плавности
  setTimeout(() => {
    isPageLoading.value = false
  }, 100)
})

// Скрываем при ошибках
nuxtApp.hook('vue:error', () => {
  isPageLoading.value = false
})
</script>

<template>
  <div>
    <!-- 🆕 Глобальная полоска загрузки -->
    <LoadingBar
      :loading="isPageLoading"
      color="blue"
      :show-glow="true"
      :show-shimmer="true"
    />

    <NuxtLayout>
      <NuxtPage />
      <Toaster />
    </NuxtLayout>
    <ClientOnly>
      <AuthLoginModal v-if="modalStore.showLoginModal" />
    </ClientOnly>
  </div>
</template>
