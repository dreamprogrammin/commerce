<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { Toaster } from 'vue-sonner'
import { useOrderRealtime } from '@/composables/useOrderRealtime'
import { useProfileStore } from '@/stores/core/profileStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'
import 'vue-sonner/style.css'

const nuxtApp = useNuxtApp()
const isMobile = useMediaQuery('(max-width: 1023px)')
const isPageLoading = ref(false)
const modalStore = useModalStore()
const profileStore = useProfileStore()
const cartStore = useCartStore()
const wishlistStore = useWishlistStore()
const route = useRoute()
const router = useRouter() // ← добавлено

// Глобальная инициализация при авторизации
const supabaseUser = useSupabaseUser()
const supabase = useSupabaseClient()

watch(supabaseUser, (newUser) => {
  if (!import.meta.client)
    return
  if (newUser) {
    wishlistStore.fetchWishlistIds()
    cartStore.mergeOnLogin()
  }
  else {
    wishlistStore.wishlistProductIds = []
    cartStore.cancelPendingSync()
  }
}, { immediate: true })

// Авто-синхронизация профиля при входе (Magic Link из Telegram, OAuth и т.д.)
// force=true, silent=true — всегда берём свежие данные из БД без мигания UI
if (import.meta.client) {
  supabase.auth.onAuthStateChange((event, session) => {
    if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session?.user) {
      profileStore.loadProfile(true, false, true)
    }
    else if (event === 'SIGNED_OUT') {
      profileStore.clearProfile()
    }
  })
}

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

const { subscribeAll, unsubscribe } = useOrderRealtime()

watch(
  () => profileStore.profile,
  (profile) => {
    if (!import.meta.client)
      return
    if (!profile || profile.telegram_chat_id)
      return

    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000
    const dismissed = localStorage.getItem('tg_modal_dismissed_at')
    if (dismissed && Date.now() - Number(dismissed) < SEVEN_DAYS)
      return

    setTimeout(() => {
      modalStore.openTelegramModal()
    }, 2000)
  },
)

onMounted(async () => {
  subscribeAll()

  // Обработка токена из Telegram magic link
  if (route.hash && route.hash.includes('access_token=')) {
    try {
      const supabase = useSupabaseClient()
      
      // Парсим хэш вручную
      const hashParams = new URLSearchParams(route.hash.substring(1))
      const accessToken = hashParams.get('access_token')
      const refreshToken = hashParams.get('refresh_token')

      if (accessToken && refreshToken) {
        // Явно устанавливаем сессию через токены
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

        if (error) throw error

        if (data.session) {
          // Чистим URL
          router.replace({ path: route.path, query: route.query, hash: '' })
        }
      }
    }
    catch (err) {
      console.error('Ошибка при обработке токена из URL:', err)
    }
  }
})

onUnmounted(() => {
  unsubscribe()
})

const siteUrl = 'https://uhti.kz'
const siteName = 'Ухтышка'

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
  {
    '@type': 'WebSite',
    '@id': `${siteUrl}/#website`,
    'name': siteName,
    'url': siteUrl,
    'publisher': { '@id': `${siteUrl}/#organization` },
    'inLanguage': 'ru-KZ',
    'potentialAction': {
      '@type': 'SearchAction',
      'target': {
        '@type': 'EntryPoint',
        'urlTemplate': `${siteUrl}/search?q={search_term_string}`,
      },
      'query-input': 'required name=search_term_string',
    },
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

    <!-- Telegram-подписка: Drawer на мобильных, Dialog на десктопе -->
    <ClientOnly>
      <CommonTelegramSubscribeDrawer v-if="isMobile" />
      <CommonTelegramSubscribeDialog v-else />
    </ClientOnly>
  </div>
</template>
