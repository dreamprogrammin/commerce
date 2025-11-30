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
    <div class="grid grid-cols-4 h-20 items-end pb-2">
      <NuxtLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="flex flex-col items-center justify-end gap-1 transition-all relative"
      >
        <div
          class="relative flex items-center justify-center rounded-full transition-all duration-300"
          :class="isActive(item.path)
            ? 'w-14 h-14 -mt-8 bg-blue-500 shadow-xl shadow-blue-500/30'
            : 'w-12 h-12 bg-gray-100'"
        >
          <Icon
            :name="item.icon"
            class="transition-all duration-300"
            :class="isActive(item.path) ? 'w-7 h-7 text-white' : 'w-6 h-6 text-muted-foreground'"
          />
          
          <ClientOnly>
            <div
              v-if="item.path === '/cart' && cartItemsCount > 0"
              class="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1 ring-2 ring-white"
            >
              {{ cartItemsCount > 99 ? '99+' : cartItemsCount }}
            </div>
          </ClientOnly>
        </div>
        
        <span
          class="text-[10px] font-medium transition-all"
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