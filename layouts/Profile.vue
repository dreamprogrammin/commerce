<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { carouselContainerVariants } from '@/lib/variants'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const { isLoggedIn } = storeToRefs(authStore)
const { fullName } = storeToRefs(profileStore)

const alwaysContainedClass = carouselContainerVariants({ contained: 'always' })

const navItems = [
  { to: '/profile', icon: 'lucide:user', label: 'Профиль', shortLabel: 'Профиль' },
  { to: '/profile/children', icon: 'lucide:smile', label: 'Мои дети', shortLabel: 'Дети' },
  { to: '/profile/order', icon: 'lucide:shopping-bag', label: 'Мои заказы', shortLabel: 'Заказы' },
  { to: '/profile/wishlist', icon: 'lucide:heart', label: 'Избранное', shortLabel: 'Избранное' },
  { to: '/profile/bonuses', icon: 'lucide:star', label: 'Бонусы', shortLabel: 'Бонусы' },
  { to: '/profile/settings', icon: 'lucide:settings', label: 'Настройки', shortLabel: 'Настройки' },
]

const userInitial = computed(() => fullName.value?.charAt(0) || 'П')

// ✅ Защита: если пользователь не авторизован - ничего не показываем
// Middleware уже откроет модальное окно и прервет навигацию
</script>

<template>
  <!-- ✅ Показываем layout только авторизованным пользователям -->
  <div v-if="isLoggedIn" class="min-h-screen flex flex-col md:block">
    <!-- Desktop Header -->
    <div class="hidden md:block">
      <CommonHeader />
    </div>

    <!-- Mobile: Profile Header -->
    <div class="md:hidden">
      <!-- User Card -->
      <div class="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-6">
        <div class="flex items-center gap-4">
          <Avatar class="h-16 w-16 border-2 border-white/30">
            <AvatarFallback class="bg-white/20 text-white text-xl">
              <ClientOnly fallback="П">
                {{ userInitial }}
              </ClientOnly>
            </AvatarFallback>
          </Avatar>
          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-bold truncate">
              <ClientOnly fallback="Загрузка...">
                {{ fullName || 'Пользователь' }}
              </ClientOnly>
            </h2>
            <p class="text-sm text-white/80">
              Личный кабинет
            </p>
          </div>
        </div>
      </div>

      <!-- Scrollable Navigation Tabs -->
      <div class="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div class="flex px-2 gap-1 overflow-x-auto hide-scrollbar">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
          >
            <template #default="{ isActive }">
              <div
                class="flex items-center gap-2 px-4 py-3 rounded-t-lg transition-colors whitespace-nowrap"
                :class="isActive
                  ? 'bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-b-2 border-blue-600'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'"
              >
                <Icon :name="item.icon" class="w-4 h-4 flex-shrink-0" />
                <span class="text-sm font-medium">{{ item.shortLabel }}</span>
              </div>
            </template>
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Main Container -->
    <div :class="`${alwaysContainedClass} flex-1 mx-auto px-4 py-4 md:py-8 pb-20 md:pb-6`">
      <div class="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 md:gap-8">
        <!-- Desktop Sidebar -->
        <aside class="hidden md:flex flex-col h-fit sticky top-4 space-y-6">
          <div class="space-y-4">
            <!-- User Info -->
            <div class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
              <Avatar class="h-10 w-10">
                <AvatarFallback>
                  <ClientOnly fallback="П">
                    {{ userInitial }}
                  </ClientOnly>
                </AvatarFallback>
              </Avatar>
              <span class="font-semibold text-base truncate flex-1">
                <ClientOnly fallback="Загрузка...">
                  {{ fullName || 'Пользователь' }}
                </ClientOnly>
              </span>
            </div>

            <!-- Navigation -->
            <nav class="flex flex-col space-y-1">
              <NuxtLink
                v-for="item in navItems"
                :key="item.to"
                :to="item.to"
              >
                <template #default="{ isActive }">
                  <Button
                    :variant="isActive ? 'secondary' : 'ghost'"
                    class="w-full justify-start"
                  >
                    <Icon :name="item.icon" class="w-4 h-4 mr-2" />
                    {{ item.label }}
                  </Button>
                </template>
              </NuxtLink>
            </nav>
          </div>

          <!-- Logout Button -->
          <div class="pt-4 border-t border-gray-200 dark:border-gray-800">
            <Button
              variant="ghost"
              class="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
              @click="authStore.signOut()"
            >
              <Icon name="lucide:log-out" class="w-4 h-4 mr-2" />
              Выйти
            </Button>
          </div>
        </aside>

        <!-- Main Content -->
        <main class="bg-background md:rounded-xl md:border md:shadow-sm md:p-6 min-h-[400px]">
          <slot />
        </main>
      </div>
    </div>

    <!-- Mobile: Bottom Navigation Bar -->
    <div class="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 shadow-lg safe-area-pb z-20">
      <div class="px-4 py-3 flex gap-2">
        <Button
          variant="outline"
          class="flex-1"
          @click="$router.push('/')"
        >
          <Icon name="lucide:home" class="w-4 h-4 mr-2" />
          Главная
        </Button>
        <Button
          variant="destructive"
          size="icon"
          class="flex-shrink-0"
          @click="authStore.signOut()"
        >
          <Icon name="lucide:log-out" class="w-5 h-5" />
        </Button>
      </div>
    </div>
  </div>

  <!-- ✅ Если не авторизован - показываем loader (на случай race condition) -->
  <div v-else class="min-h-screen flex items-center justify-center">
    <div class="text-center space-y-4">
      <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
      <p class="text-muted-foreground">
        Проверка авторизации...
      </p>
    </div>
  </div>
</template>

<style scoped>
.safe-area-pb {
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom));
}

.hide-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.hide-scrollbar::-webkit-scrollbar {
  display: none;
}
</style>
