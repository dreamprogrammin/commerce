<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

interface NavItem {
  path: string
  icon: string
  label: string
  badge?: 'cart' | 'wish'
  requiresAuth?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: 'gravity-ui:house', label: 'Главная' },
  { path: '/catalog', icon: 'lucide:layout-grid', label: 'Каталог' },
  { path: '/profile/wishlist', icon: 'gravity-ui:heart', label: 'Избранное', badge: 'wish', requiresAuth: true },
  { path: '/profile', icon: 'gravity-ui:person', label: 'Профиль', requiresAuth: true },
  { path: '/cart', icon: 'gravity-ui:shopping-bag', label: 'Корзина', badge: 'cart' },
]

const route = useRoute()
const cartStore = useCartStore()
const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const modalStore = useModalStore()

const { isLoggedIn } = storeToRefs(authStore)
const { totalItems: cartCount } = storeToRefs(cartStore)
const wishCount = computed(() => wishlistStore.wishlistProductIds.length)

function isActivePath(path: string) {
  // '/profile' must match exactly — otherwise it also lights up on '/profile/wishlist'
  if (path === '/' || path === '/profile')
    return route.path === path
  return route.path.startsWith(path)
}

const activeIndex = computed(() => NAV_ITEMS.findIndex(item => isActivePath(item.path)))

const displayItems = computed(() => NAV_ITEMS.map((item, index) => {
  const count = item.badge === 'cart' ? cartCount.value : item.badge === 'wish' ? wishCount.value : 0
  return {
    ...item,
    isActive: index === activeIndex.value,
    badgeText: count > 99 ? '99+' : String(count),
    showBadge: !!item.badge && count > 0,
  }
}))

const lensStyle = computed(() => ({
  transform: `translateY(-50%) translateX(${Math.max(activeIndex.value, 0) * 100}%)`,
}))

// NuxtLink's own navigation handler runs before a sibling `@click` listener,
// so a plain `event.preventDefault()` there is too late to stop it. Using the
// `custom` slot hands us the `navigate` trigger directly, so the gate always
// runs first.
function handleItemClick(event: MouseEvent, item: NavItem, navigate: (e?: MouseEvent) => void) {
  if (item.requiresAuth && !isLoggedIn.value) {
    event.preventDefault()
    modalStore.openLoginModal()
    return
  }
  navigate(event)
}

// Scroll-aware visibility: hide once scrolled past 280px while moving down,
// reveal again on any upward scroll or once back near the top.
const isHidden = ref(false)
let lastScrollY = 0
let ticking = false

function applyScroll() {
  ticking = false
  const y = window.scrollY
  const dy = y - lastScrollY
  if (dy > 6 && y > 280)
    isHidden.value = true
  else if (dy < -6 || y < 120)
    isHidden.value = false
  lastScrollY = y
}

function onScroll() {
  if (!ticking) {
    ticking = true
    requestAnimationFrame(applyScroll)
  }
}

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', onScroll, { passive: true })
})
onUnmounted(() => window.removeEventListener('scroll', onScroll))
</script>

<template>
  <nav
    class="flex items-center lg:hidden z-50 mbn-bar"
    :class="isHidden ? 'mbn-bar--hidden' : ''"
    aria-label="Основная навигация"
  >
    <span v-if="activeIndex >= 0" class="mbn-lens" :style="lensStyle">
      <span class="mbn-lens__pill" />
    </span>

    <NuxtLink
      v-for="item in displayItems"
      :key="item.path"
      v-slot="{ href, navigate }"
      :to="item.path"
      custom
    >
      <a
        :href="href"
        class="mbn-item"
        :aria-label="item.label"
        :aria-current="item.isActive ? 'page' : undefined"
        @click="handleItemClick($event, item, navigate)"
      >
        <span class="mbn-icon-wrap">
          <Icon
            :name="item.icon"
            mode="svg"
            class="mbn-icon transition-[transform,color] duration-300 ease-out"
            :class="item.isActive ? 'text-primary scale-[1.18]' : 'text-muted-foreground scale-100'"
          />
          <span v-if="item.showBadge" class="mbn-badge">{{ item.badgeText }}</span>
        </span>
      </a>
    </NuxtLink>
  </nav>
</template>

<style scoped>
.mbn-bar {
  position: fixed;
  left: 16px;
  right: 16px;
  bottom: calc(12px + env(safe-area-inset-bottom));
  height: 50px;
  background: linear-gradient(150deg, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0.18));
  backdrop-filter: blur(24px) saturate(1.9);
  -webkit-backdrop-filter: blur(24px) saturate(1.9);
  border: 1px solid rgba(255, 255, 255, 0.65);
  border-radius: 22px;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.85),
    inset 0 -1px 1px rgba(15, 23, 42, 0.05),
    0 12px 32px rgba(15, 23, 42, 0.18);
  transition:
    opacity 0.28s ease,
    transform 0.28s cubic-bezier(0.32, 0.72, 0.33, 1);
}

.mbn-bar--hidden {
  opacity: 0;
  pointer-events: none;
  transform: translateY(140%);
}

.mbn-lens {
  position: absolute;
  top: 50%;
  left: 0;
  width: 20%;
  height: 100%;
  display: grid;
  place-content: center;
  transition: transform 0.46s cubic-bezier(0.34, 1.12, 0.4, 1);
  pointer-events: none;
  z-index: 0;
}

.mbn-lens__pill {
  width: 42px;
  height: 42px;
  border-radius: 999px;
  background: linear-gradient(160deg, rgba(255, 255, 255, 0.95), rgba(255, 255, 255, 0.5));
  border: 1px solid rgba(255, 255, 255, 0.95);
  box-shadow:
    inset 0 2px 1px rgba(255, 255, 255, 1),
    inset 0 -3px 5px rgba(15, 23, 42, 0.09),
    0 7px 18px rgba(15, 23, 42, 0.22);
}

.mbn-item {
  flex: 1;
  min-width: 0;
  position: relative;
  z-index: 1;
  height: 100%;
  display: grid;
  place-content: center;
}

.mbn-icon-wrap {
  position: relative;
  display: grid;
  place-content: center;
  width: 40px;
  height: 40px;
}

.mbn-icon {
  width: 22px;
  height: 22px;
}

.mbn-badge {
  position: absolute;
  top: -3px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font: 700 10px var(--font-sans);
  display: grid;
  place-content: center;
  border: 2px solid #fff;
}
</style>
