<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

const route = useRoute()
const cartStore = useCartStore()
const authStore = useAuthStore()
const modalStore = useModalStore()

const { isLoggedIn } = storeToRefs(authStore)

// Scroll-aware visibility
const isVisible = ref(true)
let lastScrollY = 0

function handleScroll() {
  const currentScrollY = window.scrollY
  if (currentScrollY < 60) {
    isVisible.value = true
  } else if (currentScrollY > lastScrollY) {
    isVisible.value = false
  } else {
    isVisible.value = true
  }
  lastScrollY = currentScrollY
}

onMounted(() => window.addEventListener('scroll', handleScroll, { passive: true }))
onUnmounted(() => window.removeEventListener('scroll', handleScroll))

interface NavItem {
  path: string
  icon: string
}

// Корзина отдельно — только основная навигация
const navItems: NavItem[] = [
  { path: '/', icon: 'streamline-plump:home-1' },
  { path: '/catalog', icon: 'streamline-plump:layout-window-4' },
  { path: '/profile', icon: 'streamline-plump:user-single-neutral-male' },
]

function isActive(path: string) {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const isCartActive = computed(() => route.path.startsWith('/cart'))

// Pill скользит только по 3 пунктам (0%, 33.33%, 66.66%)
const activeIndex = computed(() => navItems.findIndex((item) => isActive(item.path)))

const cartItemsCount = computed(() =>
  cartStore.items.reduce((total, item) => total + item.quantity, 0),
)

function handleProfileClick(event: Event) {
  if (!isLoggedIn.value) {
    event.preventDefault()
    modalStore.openLoginModal()
  }
}
</script>

<template>
  <div
    class="lg:hidden fixed bottom-0 left-0 right-0 z-50 flex items-end justify-between nav-wrapper"
    :class="isVisible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'"
  >
    <!-- Основная навигация: Главная, Каталог, Профиль -->
    <nav class="floating-bar">
      <!-- Скользящий pill -->
      <div
        v-if="activeIndex >= 0"
        class="sliding-pill"
        :style="{ left: `${activeIndex * 33.333}%` }"
      />

      <NuxtLink
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        class="nav-item"
        @click="item.path === '/profile' ? handleProfileClick($event) : undefined"
      >
        <Icon
          :name="item.icon"
          class="transition-all duration-300"
          :class="isActive(item.path) ? 'w-7 h-7 text-blue-600' : 'w-6 h-6 text-gray-400'"
          mode="svg"
        />
      </NuxtLink>
    </nav>

    <!-- Отдельная кнопка корзины справа -->
    <NuxtLink to="/cart" class="cart-btn" :class="isCartActive ? 'cart-btn--active' : ''">
      <div class="relative">
        <Icon
          name="streamline-plump:shopping-basket-1"
          class="transition-all duration-300"
          :class="isCartActive ? 'w-7 h-7 text-blue-600' : 'w-6 h-6 text-gray-400'"
          mode="svg"
        />
        <ClientOnly>
          <div
            v-if="cartItemsCount > 0"
            class="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-0.5"
          >
            {{ cartItemsCount > 99 ? '99+' : cartItemsCount }}
          </div>
        </ClientOnly>
      </div>
    </NuxtLink>
  </div>
</template>

<style scoped>
.nav-wrapper {
  padding-bottom: env(safe-area-inset-bottom);
  padding-left: 1.25rem;
  padding-right: 1.25rem;
  padding-top: 0.5rem;
  gap: 0.625rem;
  transition:
    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.floating-bar {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  flex: 1;
  padding: 0.375rem;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  pointer-events: all;
  margin-bottom: 0.5rem;
}

/* Скользящий pill по 3 пунктам */
.sliding-pill {
  position: absolute;
  top: 0.375rem;
  bottom: 0.375rem;
  width: 33.333%;
  border-radius: 18px;
  background: rgba(59, 130, 246, 0.12);
  transition: left 0.35s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
}

.nav-item {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 48px;
  border-radius: 18px;
}

/* Отдельная кнопка корзины */
.cart-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.82);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.1),
    0 2px 8px rgba(0, 0, 0, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);
  pointer-events: all;
  margin-bottom: 0.5rem;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.cart-btn--active {
  background: rgba(59, 130, 246, 0.12);
  border-color: rgba(59, 130, 246, 0.2);
}
</style>
