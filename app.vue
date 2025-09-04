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
</script>

<template>
  <div>
    <CommonHeader />

    <main>
      <div class="app-container">
        <NuxtLayout>
          <NuxtPage />
          <Toaster />
        </NuxtLayout>
      </div>
    </main>

    <ClientOnly>
      <AuthLoginModal v-if="modalStore.showLoginModal" />
    </ClientOnly>
  </div>
</template>
