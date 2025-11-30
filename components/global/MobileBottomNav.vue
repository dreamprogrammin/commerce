<script setup lang="ts">
import { useCartStore } from '@/stores/publicStore/cartStore'

const route = useRoute()
const cartStore = useCartStore()

interface NavItem {
  path: string
  label: string
  icon: string
}

const navItems: NavItem[] = [
  {
    path: '/',
    label: 'Главная',
    icon: 'lucide:home',
  },
  {
    path: '/catalog',
    label: 'Каталог',
    icon: 'lucide:layout-grid',
  },
  {
    path: '/cart',
    label: 'Корзина',
    icon: 'lucide:shopping-cart',
  },
  {
    path: '/profile',
    label: 'Профиль',
    icon: 'lucide:user',
  },
]

const isActive = (path: string) => {
  if (path === '/') {
    return route.path === '/'
  }
  return route.path.startsWith(path)
}

const cartItemsCount = computed(() => {
  return cartStore.items.reduce((total, item) => total + item.quantity, 0)
})
</script>

<template>
  <nav
    class="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t safe-area-inset-bottom"
  >
    <div class="grid grid-cols-4 h-16 items-end pb-1">
      <NuxtLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex flex-col items-center justify-end gap-0.5 transition-all relative"
      >
        <div
          class="relative flex items-center justify-center rounded-full transition-all duration-300"
          :class="isActive(item.path)
            ? 'w-12 h-12 -mt-6 bg-blue-500 shadow-lg shadow-blue-500/25'
            : 'w-10 h-10 bg-gray-100'"
        >
          <Icon
            :name="item.icon"
            class="transition-all duration-300"
            :class="isActive(item.path) ? 'w-6 h-6 text-white' : 'w-5 h-5 text-muted-foreground'"
          />
          
          <ClientOnly>
            <div
              v-if="item.path === '/cart' && cartItemsCount > 0"
              class="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 ring-2 ring-white"
            >
              {{ cartItemsCount > 99 ? '99+' : cartItemsCount }}
            </div>
          </ClientOnly>
        </div>
        
        <span
          class="text-[9px] font-medium transition-all pb-0.5"
          :class="isActive(item.path) ? 'text-blue-500 font-semibold' : 'text-muted-foreground'"
        >
          {{ item.label }}
        </span>
      </NuxtLink>
    </div>
  </nav>
</template>

<style scoped>
.safe-area-inset-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>