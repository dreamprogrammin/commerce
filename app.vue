<script setup lang="ts">
// 🆕 Управление LoadingBar при навигации
import 'vue-sonner/style.css'
import { useMediaQuery } from '@vueuse/core'
import { useOrderRealtime } from '@/composables/useOrderRealtime'

const nuxtApp = useNuxtApp()
const isMobile = useMediaQuery('(max-width: 1023px)')
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

// 🔔 Realtime подписка на изменения заказов
// Автоматически обновляет остатки товаров при подтверждении заказов
const { subscribeAll, unsubscribe } = useOrderRealtime()

onMounted(() => {
  // Подписываемся на все необходимые события
  subscribeAll()
})

onUnmounted(() => {
  // Отписываемся при размонтировании
  unsubscribe()
})

const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const route = useRoute()

// ✅ Динамичный шаблон для title всех страниц + hreflang
useHead({
  titleTemplate: (titleChunk) => {
    return titleChunk ? `${titleChunk}` : `${siteName} - Интернет-магазин детских игрушек`
  },
  // ✅ Глобальные hreflang теги для русского/казахского языков
  link: () => {
    const currentPath = route.fullPath
    const currentUrl = `${siteUrl}${currentPath}`

    return [
      { rel: 'alternate', hreflang: 'ru', href: currentUrl },
      { rel: 'alternate', hreflang: 'kk', href: currentUrl },
      { rel: 'alternate', hreflang: 'x-default', href: currentUrl },
    ]
  },
})

// ✅ Глобальная Schema.org Organization (используется на всех страницах)
useSchemaOrg([
  {
    '@type': 'Organization',
    '@id': `${siteUrl}/#organization`,
    'name': siteName,
    'legalName': 'ИП Ухтышка',
    'url': siteUrl,
    'logo': {
      '@type': 'ImageObject',
      '@id': `${siteUrl}/#logo`,
      'url': `${siteUrl}/logo.png`,
      'contentUrl': `${siteUrl}/logo.png`,
      'width': 250,
      'height': 60,
      'caption': siteName,
    },
    'image': { '@id': `${siteUrl}/#logo` },
    'description': 'Интернет-магазин детских игрушек с широким ассортиментом и быстрой доставкой по Казахстану',
    'foundingDate': '2024',
    'address': {
      '@type': 'PostalAddress',
      'addressCountry': 'KZ',
      'addressLocality': 'Алматы',
      'addressRegion': 'Алматинская область',
    },
    'contactPoint': {
      '@type': 'ContactPoint',
      'telephone': '+7-702-537-94-73',
      'contactType': 'customer service',
      'availableLanguage': ['Russian', 'Kazakh'],
      'areaServed': 'KZ',
    },
    'sameAs': [
      'https://www.instagram.com/uhtykz',
    ],
  },
])
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
      <Toaster
        position="top-center"
        :offset="16"
        :mobile-offset="{ top: 70, left: 16, right: 16 }"
        :toast-options="{
          duration: 3000,
        }"
        rich-colors
      />
    </NuxtLayout>

    <!-- 🆕 Мобильная навигация -->
    <ClientOnly>
      <MobileBottomNav />
    </ClientOnly>

    <!-- Авторизация: Drawer на мобильных, Modal на десктопе -->
    <ClientOnly>
      <AuthLoginDrawer v-if="isMobile" />
      <AuthLoginModal v-else />
    </ClientOnly>
  </div>
</template>
