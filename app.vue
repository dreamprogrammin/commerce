<script setup lang="ts">
// --- 1. ИМПОРТЫ ---
// Импортируем наши "ядерные" сторы.
// Сам факт их импорта и вызова заставит Pinia их создать и запустить.
import { useModalStore } from '@/stores/modal/useModalStore'
import { useAuthStore } from './stores/auth'
import { useProductsStore } from './stores/publicStore/productsStore'

// --- 2. ИНИЦИАЛИЗАЦИЯ СТОРОВ ---
// Просто вызываем их один раз. Вся логика (`onAuthStateChange`, `watch`)
// запустится автоматически ВНУТРИ сторов.
useAuthStore()
useProductsStore()
const modalStore = useModalStore() // modalStore нам нужен для v-if в шаблоне

// --- 3. ГЛОБАЛЬНЫЕ SEO-НАСТРОЙКИ ---
// `app.vue` - идеальное место для установки мета-тегов по умолчанию для всего сайта.
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
  // ogImage: 'https://example.com/og-image.png', // TODO: Добавить картинку для соцсетей
  // twitterCard: 'summary_large_image',
})

// --- 4. ВСЁ! Больше никакой логики здесь не нужно. ---
// Никаких `useSupabaseUser()`, `watch` и т.д.
</script>

<template>
  <div>
    <!--
      `NuxtLayout` автоматически обернет твою страницу в нужный layout.
      `CommonHeader` теперь должен быть частью layout'а (например, `layouts/default.vue`),
      а не `app.vue`, чтобы он не показывался на layout'е 'profile', если тот отличается.
      Но для простоты можно оставить и так.
    -->
    <CommonHeader />

    <main>
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </main>

    <!--
      `NuxtLayout` внутри `main` не нужен. `NuxtPage` уже будет обернута.
      Структура должна быть: Header, Main > NuxtPage, Footer
    -->

    <!-- Модальное окно входа. Оно живет здесь, чтобы быть доступным на любой странице. -->
    <ClientOnly>
      <AuthLoginModal v-if="modalStore.showLoginModal" />
    </ClientOnly>
  </div>
</template>
