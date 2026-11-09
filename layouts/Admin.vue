<script setup lang="ts">
import {
  AlertTriangle,
  BarChart3,
  Home,
  Menu,
  Package,
} from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import { useAuth } from '@/composables/auth/useAuth'
import { useCacheManager } from '@/composables/useCacheManager'
import { useAdminQuestionsStore } from '@/stores/adminStore/adminQuestionsStore'
import { useAdminReviewsStore } from '@/stores/adminStore/adminReviewsStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { PURCHASING_PAGES } from '@/utils/smartPurchasing'

const { handleOut } = useAuth()
const { clearAllQueryCache, hardReset } = useCacheManager()
const adminQuestionsStore = useAdminQuestionsStore()
const adminReviewsStore = useAdminReviewsStore()
const route = useRoute()
const profileStore = useProfileStore()
const { fullName, profile } = storeToRefs(profileStore)
// Пока профиль не загружен, fullName — «Гость»: имени не показываем вовсе.
// И только после монтирования: в браузере профиль приходит из localStorage
// раньше гидрации, и имя из серверной разметки с ним не совпало бы
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const adminName = computed(() => mounted.value && profile.value ? fullName.value : '')
const initial = computed(() => adminName.value.trim().charAt(0).toUpperCase())

const isMobileMenuOpen = ref(false)

// Закрываем мобильное меню при переходе
watch(() => route.path, () => {
  isMobileMenuOpen.value = false
})

onMounted(() => {
  adminQuestionsStore.fetchUnansweredCount()
  adminReviewsStore.fetchUnpublishedCount()
})

// Умный закуп — одним пунктом (владелец 3.11.2026: «собери всё в одном месте»,
// «лишнее с сайд-меню убрать»). Его страницы — кнопками на дашборде, и пункт
// горит на них так же, как на самом дашборде
const PURCHASING = '/admin/purchasing'
const inPurchasing = computed(() => [PURCHASING, ...PURCHASING_PAGES.map(p => p.to)]
  .some(to => route.path === to || route.path.startsWith(`${to}/`)))
</script>

<template>
  <!--
    Брейкпоинт lg, а не md: десктопная строка SiteHeader живёт на ≥lg, ниже
    он рисует компактную мобильную плашку — в админке она не нужна.
  -->
  <div class="hidden lg:block">
    <CommonSiteHeader />
  </div>
  <div class="flex min-h-screen w-full bg-muted/40">
    <!-- Десктоп сайдбар: карточка по макету AdminSidebar.dc.html -->
    <!-- 272 = карточка 248, как в макете, и поля по 12 -->
    <aside class="hidden w-[272px] shrink-0 p-3 md:block">
      <div
        class="sticky top-3 flex max-h-[calc(100vh-1.5rem)] flex-col gap-[22px] overflow-y-auto rounded-[20px] bg-background px-3.5 pt-5 pb-4 shadow-sm"
        data-testid="admin-sidebar"
      >
        <NuxtLink to="/" class="flex items-center gap-2.5 px-1.5">
          <span class="flex size-[38px] shrink-0 items-center justify-center rounded-xl bg-primary text-white shadow-[0_6px_16px_rgba(43,127,255,0.35)]">
            <Icon name="ic:round-toys" class="text-[22px]" />
          </span>
          <span class="flex flex-col gap-0.5">
            <span class="text-[17px] leading-tight font-bold tracking-[-0.01em]">Ухтышка</span>
            <span class="text-xs text-muted-foreground">Панель администратора</span>
          </span>
        </NuxtLink>

        <AdminNav />

        <div class="mt-auto flex items-center gap-2.5 border-t border-neutral-100 px-2 pt-3">
          <Avatar class="size-9">
            <AvatarImage v-if="profile?.avatar_url" :src="profile.avatar_url" alt="" />
            <AvatarFallback>
              <template v-if="initial">
                {{ initial }}
              </template>
              <Icon v-else name="lucide:user" class="text-base" />
            </AvatarFallback>
          </Avatar>
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span v-if="adminName" class="truncate text-sm font-semibold" data-testid="admin-sidebar-name">{{ adminName }}</span>
            <span class="text-xs text-muted-foreground">Администратор</span>
          </div>
          <Button variant="ghost" size="icon" aria-label="Выйти" @click="handleOut">
            <Icon name="lucide:log-out" class="text-[18px]" />
          </Button>
        </div>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col pb-16 md:pb-0">
      <!-- Хедер -->
      <header
        class="sticky top-0 z-10 flex h-14 md:h-16 items-center gap-4 border-b bg-background px-4 md:px-6"
      >
        <h1 class="text-lg md:text-xl font-semibold truncate">
          Панель администратора
        </h1>
        <div class="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="hidden sm:inline-flex"
            @click="clearAllQueryCache"
          >
            <Icon name="lucide:trash-2" class="w-4 h-4 sm:mr-2" />
            <span class="hidden sm:inline">Очистить кеш</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="hidden sm:inline-flex"
            @click="hardReset"
          >
            <Icon name="lucide:refresh-cw" class="w-4 h-4 sm:mr-2" />
            <span class="hidden sm:inline">Полный сброс</span>
          </Button>
          <Button size="sm" class="md:hidden" @click="handleOut">
            Выйти
          </Button>
        </div>
      </header>

      <!-- Контент -->
      <main class="flex-1 overflow-y-auto">
        <slot />
      </main>
    </div>

    <!-- Мобильный Bottom Bar -->
    <div class="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <nav class="flex items-center justify-around h-16 px-1">
        <NuxtLink
          to="/admin"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground transition-colors"
          active-class="text-primary"
        >
          <Home class="w-5 h-5" />
          <span class="text-[10px]">
            Главная
          </span>
        </NuxtLink>

        <NuxtLink
          to="/admin/products"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground transition-colors"
          active-class="text-primary"
        >
          <Package class="w-5 h-5" />
          <span class="text-[10px]">
            Товары
          </span>
        </NuxtLink>

        <NuxtLink
          :to="PURCHASING"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 relative text-muted-foreground transition-colors"
          :class="{ 'text-primary': inPurchasing }"
          active-class="text-primary"
        >
          <AlertTriangle class="w-5 h-5" />
          <span class="text-[10px]">
            Закупки
          </span>
        </NuxtLink>

        <NuxtLink
          to="/admin/sales"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground transition-colors"
          active-class="text-primary"
        >
          <BarChart3 class="w-5 h-5" />
          <span class="text-[10px]">
            Продажи
          </span>
        </NuxtLink>

        <!-- Бургер → Sheet -->
        <button
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 text-muted-foreground transition-colors"
          @click="isMobileMenuOpen = true"
        >
          <Menu class="w-5 h-5" />
          <span class="text-[10px]">
            Меню
          </span>
        </button>
      </nav>
    </div>

    <!-- Мобильное Sheet-меню -->
    <Sheet v-model:open="isMobileMenuOpen">
      <SheetContent side="left" class="w-[280px] p-0">
        <SheetHeader class="p-4 border-b">
          <SheetTitle>Навигация</SheetTitle>
        </SheetHeader>
        <div class="max-h-[calc(100vh-12rem)] flex-1 overflow-y-auto px-3.5 py-4">
          <AdminNav />
        </div>
        <div class="border-t p-3 space-y-2">
          <Button variant="outline" size="sm" class="w-full" @click="clearAllQueryCache">
            <Icon name="lucide:trash-2" class="w-4 h-4 mr-2" />
            Очистить кеш
          </Button>
          <Button variant="outline" size="sm" class="w-full" @click="hardReset">
            <Icon name="lucide:refresh-cw" class="w-4 h-4 mr-2" />
            Полный сброс
          </Button>
        </div>
      </SheetContent>
    </Sheet>

    <!-- Очередь обновления сайта после правок: adminRevalidateStore -->
    <ClientOnly>
      <AdminRevalidateTimer />
    </ClientOnly>
  </div>
</template>
