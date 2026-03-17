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

const { handleOut } = useAuth()
const { clearAllQueryCache, hardReset } = useCacheManager()
const adminQuestionsStore = useAdminQuestionsStore()
const adminReviewsStore = useAdminReviewsStore()
const route = useRoute()

const isMobileMenuOpen = ref(false)

// Закрываем мобильное меню при переходе
watch(() => route.path, () => {
  isMobileMenuOpen.value = false
})

onMounted(() => {
  adminQuestionsStore.fetchUnansweredCount()
  adminReviewsStore.fetchUnpublishedCount()
})

// Все ссылки навигации
const navLinks = [
  { to: '/admin', label: 'Дашборд', exact: true },
  { to: '/admin/categories', label: 'Управление меню' },
  { to: '/admin/popular-categories', label: 'Популярные категории' },
  { to: '/admin/slides', label: 'Управление слайдами' },
  { to: '/admin/users', label: 'Управление пользователями' },
  { to: '/admin/products', label: 'Управление товарами' },
  { to: '/admin/brands', label: 'Добавление бренда' },
  { to: '/admin/brand-seo', label: 'SEO: Бренд + Категория' },
  { to: '/admin/attributes', label: 'Управление атрибутами' },
  { to: '/admin/banners', label: 'Управление банерами' },
  { to: '/admin/questions', label: 'Вопросы', badge: () => adminQuestionsStore.unansweredCount },
  { to: '/admin/reviews', label: 'Отзывы', badge: () => adminReviewsStore.unpublishedCount },
  { to: '/admin/suppliers', label: 'Поставщики' },
  { to: '/admin/restock', label: 'К закупке' },
  { to: '/admin/pos', label: 'Оффлайн касса' },
  { to: '/admin/returns', label: 'Возвраты' },
  { to: '/admin/sales', label: 'Продажи' },
  { to: '/admin/reports', label: 'Отчёты' },
  { to: '/admin/promotions', label: 'Акции' },
  { to: '/admin/broadcast', label: 'Рассылка' },
]
</script>

<template>
  <div class="hidden md:block">
    <CommonHeader />
  </div>
  <div class="flex min-h-screen w-full bg-muted/40">
    <!-- Десктоп сайдбар -->
    <aside class="hidden w-64 flex-col border-r bg-background md:flex">
      <div class="flex h-16 items-center border-b px-6">
        <NuxtLink to="/" class="flex items-center gap-2 font-semibold">
          <span>Мой проект</span>
        </NuxtLink>
      </div>

      <nav class="flex-1 space-y-1 overflow-y-auto p-4">
        <NuxtLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          class="flex items-center justify-between rounded-lg px-3 py-2 text-muted-foreground transition-all hover:text-primary"
          active-class="bg-muted text-primary"
        >
          <span>{{ link.label }}</span>
          <Badge
            v-if="link.badge && link.badge() > 0"
            variant="destructive"
            class="text-xs"
          >
            {{ link.badge() }}
          </Badge>
        </NuxtLink>
      </nav>
    </aside>

    <div class="flex flex-1 flex-col pb-16 md:pb-0">
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
          <Button size="sm" @click="handleOut">
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
          to="/admin/restock"
          class="flex flex-col items-center justify-center gap-0.5 flex-1 py-1 relative text-muted-foreground transition-colors"
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
        <nav class="flex-1 overflow-y-auto p-3 space-y-1 max-h-[calc(100vh-8rem)]">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="flex items-center justify-between rounded-lg px-3 py-2.5 text-muted-foreground transition-all hover:text-primary active:bg-muted"
            active-class="bg-muted text-primary"
          >
            <span class="text-sm">{{ link.label }}</span>
            <Badge
              v-if="link.badge && link.badge() > 0"
              variant="destructive"
              class="text-xs"
            >
              {{ link.badge() }}
            </Badge>
          </NuxtLink>
        </nav>
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
  </div>
</template>
