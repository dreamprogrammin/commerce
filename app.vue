<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { Toaster } from 'vue-sonner'
import { useOrderRealtime } from '@/composables/useOrderRealtime'
import 'vue-sonner/style.css'

const nuxtApp = useNuxtApp()
const isMobile = useMediaQuery('(max-width: 1023px)')
const isPageLoading = ref(false)

nuxtApp.hook('page:start', () => {
  isPageLoading.value = true
})

nuxtApp.hook('page:finish', () => {
  setTimeout(() => {
    isPageLoading.value = false
  }, 100)
})

nuxtApp.hook('vue:error', () => {
  isPageLoading.value = false
})

// 🔔 Realtime подписка на изменения заказов
const { subscribeAll, unsubscribe } = useOrderRealtime()

onMounted(() => {
  subscribeAll()
})

onUnmounted(() => {
  unsubscribe()
})

const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'
const route = useRoute()

useHead({
  titleTemplate: (titleChunk) => {
    return titleChunk ? `${titleChunk}` : `${siteName} - Интернет-магазин детских игрушек`
  },
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

      <!-- ✅ ИСПРАВЛЕНИЕ: Toaster только на клиенте -->
      <ClientOnly>
        <Toaster
          position="top-center"
          :offset="16"
          :mobile-offset="{ top: 70, left: 16, right: 16 }"
          :toast-options="{
            duration: 3000,
          }"
          rich-colors
        />
      </ClientOnly>
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
