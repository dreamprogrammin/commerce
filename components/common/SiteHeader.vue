<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

/**
 * Шапка витрины — порт SiteHeader.dc.html.
 *
 * Одна строка: логотип · «Каталог» · строка поиска · избранное · корзина ·
 * вход/аккаунт. Кнопка «Каталог» открывает мега-меню с рельсом 274px.
 *
 * `variant`:
 *  - `overlay` — прозрачная поверх героя (главная), стекло при скролле за герой;
 *  - `solid`   — плашка цвета `--header-bg` (каталог/внутренние), стекло при
 *                скролле > 8px. В обоих режимах шапка `position:fixed`, а место
 *                под неё резервирует распорка (только `solid`).
 *
 * `sticky` (default `true`): когда `false`, шапка рендерится в потоке
 * (`position:static`, без распорки и без стекла-при-скролле) и просто
 * уезжает вместе со страницей — используется на `catalog-listing`, где
 * единственный элемент, который должен "прилипать" при скролле, это
 * `CategoryScrollBar`, а не сама шапка.
 *
 * Десктоп-строка живёт на ≥lg; на <lg — компактная плашка (нужна только там,
 * где макет не прячет шапку, т.е. Internal). Прочие витринные макеты прячут
 * шапку на мобильном своей обёрткой и оставляют собственный мобильный хедер.
 */
const props = withDefaults(
  defineProps<{ variant?: 'overlay' | 'solid', sticky?: boolean }>(),
  { variant: 'solid', sticky: true },
)

const authStore = useAuthStore()
const profileStore = useProfileStore()
const wishlistStore = useWishlistStore()
const cartStore = useCartStore()
const modalStore = useModalStore()
const route = useRoute()

const { user, isLoggedIn: isAuth } = storeToRefs(authStore)
const { fullName, bonusBalance } = storeToRefs(profileStore)

const wishlistCount = computed(() => wishlistStore.wishlistProductIds.length)
const cartCount = computed(() => cartStore.items.length)
const userInitial = computed(() => fullName.value?.charAt(0).toUpperCase() || 'П')
const formattedBonus = computed(() => (bonusBalance.value ?? 0).toLocaleString('ru-KZ'))

const isOverlay = computed(() => props.variant === 'overlay')

// ---------------------------------------------------------------------------
// Стекло при скролле.
// overlay — порог завязан на высоту героя (как в прежней шапке главной,
// clamp(560, 80vh, 760) * 0.55); solid — простой порог из прототипа (>8px).
// ---------------------------------------------------------------------------
const isScrolled = ref(false)

function scrolledThreshold(): number {
  if (isOverlay.value) {
    const vh = window.innerHeight || 760
    return Math.min(760, Math.max(560, vh * 0.8)) * 0.55
  }
  return 8
}

let rafId = 0
function onScroll() {
  if (rafId)
    return
  rafId = requestAnimationFrame(() => {
    rafId = 0
    const next = window.scrollY > scrolledThreshold()
    if (next !== isScrolled.value)
      isScrolled.value = next
  })
}

// ---------------------------------------------------------------------------
// Мега-меню «Каталог».
// ---------------------------------------------------------------------------
const catalogOpen = ref(false)
const catalogBtn = ref<HTMLButtonElement | null>(null)
function toggleCatalog() {
  catalogOpen.value = !catalogOpen.value
}
function closeCatalog() {
  catalogOpen.value = false
}
function onKeydown(e: KeyboardEvent) {
  // Esc закрывает каталог и возвращает фокус на кнопку-переключатель.
  if (e.key === 'Escape' && catalogOpen.value) {
    closeCatalog()
    catalogBtn.value?.focus()
  }
}

// Закрываем каталог при навигации.
watch(() => route.fullPath, closeCatalog)

onMounted(() => {
  if (props.sticky) {
    window.addEventListener('scroll', onScroll, { passive: true })
    isScrolled.value = window.scrollY > scrolledThreshold()
  }
  window.addEventListener('keydown', onKeydown)
  if (user.value)
    profileStore.loadProfile()
})

onUnmounted(() => {
  if (props.sticky)
    window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKeydown)
  if (rafId)
    cancelAnimationFrame(rafId)
})

function openLogin() {
  modalStore.openLoginModal()
}

const wrapStyle = computed<CSSProperties>(() => {
  if (!props.sticky) {
    return {
      position: 'static',
      zIndex: 100,
      background: 'var(--header-bg)',
      border: '1px solid transparent',
    }
  }

  const scrolled = isScrolled.value
  const tTop = isOverlay.value
  return {
    position: 'fixed',
    zIndex: 100,
    top: scrolled ? '12px' : '0',
    left: scrolled ? '12px' : '0',
    right: scrolled ? '12px' : '0',
    borderRadius: scrolled ? '22px' : '0',
    overflow: 'hidden',
    transition:
      'top .25s ease, left .25s ease, right .25s ease, border-radius .25s ease, background .25s ease, box-shadow .25s ease, backdrop-filter .25s ease',
    background: scrolled
      ? 'color-mix(in srgb, var(--header-bg) 66%, transparent)'
      : (tTop ? 'transparent' : 'var(--header-bg)'),
    backdropFilter: scrolled ? 'blur(18px) saturate(1.5)' : 'none',
    WebkitBackdropFilter: scrolled ? 'blur(18px) saturate(1.5)' : 'none',
    border: scrolled ? '1px solid rgba(255,255,255,.22)' : '1px solid transparent',
    boxShadow: scrolled ? '0 10px 30px rgba(15,23,42,.2)' : 'none',
  }
})
</script>

<template>
  <div>
    <!-- ============ ДЕСКТОП (≥lg) ============ -->
    <div class="hidden lg:block">
      <!-- Распорка под fixed-шапку (только solid+sticky; overlay парит над героем, non-sticky не fixed вовсе). -->
      <div v-if="!isOverlay && sticky" class="sh-spacer" />

      <div :class="{ 'max-w-screen-2xl mx-auto': isOverlay && isScrolled }" :style="wrapStyle">
        <header class="sh-header">
          <div class="sh-row app-container">
            <!-- Логотип -->
            <NuxtLink to="/" class="sh-logo" aria-label="Ухтышка — на главную">
              <span class="sh-logo__badge">
                <svg viewBox="11 0 64 78" width="26" height="31" aria-hidden="true">
                  <g transform="translate(2 0)"><g transform="rotate(-9 42 72)">
                    <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="#fff" />
                    <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="rgba(255,255,255,.65)" />
                    <path d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z" fill="#fff" />
                    <rect x="20" y="46.5" width="44" height="6" rx="3" fill="#ffd34d" />
                    <path d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z" fill="#ff8ac2" />
                  </g></g>
                </svg>
              </span>
              <span class="sh-logo__word">Ухтышка</span>
            </NuxtLink>

            <!-- Каталог -->
            <button
              ref="catalogBtn"
              type="button"
              class="sh-cat"
              :class="{ 'sh-cat--open': catalogOpen }"
              :aria-expanded="catalogOpen"
              aria-controls="sh-catalog-panel"
              aria-haspopup="true"
              @click="toggleCatalog"
            >
              <Icon :name="catalogOpen ? 'lucide:x' : 'lucide:layout-grid'" class="size-5" />
              <span>Каталог</span>
            </button>

            <!-- Поиск -->
            <CommonSiteHeaderSearch />

            <!-- Избранное -->
            <NuxtLink to="/profile/wishlist" class="sh-icon-btn" aria-label="Избранное">
              <Icon name="line-md:heart" class="size-[22px]" mode="svg" />
              <ClientOnly>
                <span v-if="wishlistCount > 0" class="sh-badge">{{ wishlistCount > 9 ? '9+' : wishlistCount }}</span>
              </ClientOnly>
            </NuxtLink>

            <!-- Корзина -->
            <NuxtLink to="/cart" class="sh-icon-btn" aria-label="Корзина">
              <Icon name="solar:cart-3-bold" class="size-[22px]" mode="svg" />
              <ClientOnly>
                <span v-if="cartCount > 0" class="sh-badge">{{ cartCount > 9 ? '9+' : cartCount }}</span>
              </ClientOnly>
            </NuxtLink>

            <!-- Вход / аккаунт -->
            <ClientOnly>
              <NuxtLink v-if="isAuth" to="/profile" class="sh-account">
                <span class="sh-account__avatar">{{ userInitial }}</span>
                <span class="sh-account__meta">
                  <span class="sh-account__name">{{ fullName }}</span>
                  <span class="sh-account__bonus">
                    <Icon name="lucide:coins" class="size-3" />
                    {{ formattedBonus }} ₸
                  </span>
                </span>
              </NuxtLink>
              <button v-else type="button" class="sh-login" @click="openLogin">
                <Icon name="lucide:user" class="size-[18px]" />
                Войти
              </button>

              <template #fallback>
                <div class="sh-account sh-account--skeleton">
                  <span class="sh-account__avatar sh-account__avatar--skeleton" />
                  <span class="sh-account__meta">
                    <span class="sh-skel sh-skel--name" />
                    <span class="sh-skel sh-skel--bonus" />
                  </span>
                </div>
              </template>
            </ClientOnly>
          </div>
        </header>
      </div>

      <CommonSiteHeaderMegaMenu :open="catalogOpen" @close="closeCatalog" />
    </div>

    <!-- ============ МОБИЛЬНАЯ ПЛАШКА (<lg) ============ -->
    <div class="flex lg:hidden sh-mobile">
      <NuxtLink to="/" class="sh-mobile__logo" aria-label="Ухтышка — на главную">
        <svg viewBox="11 0 64 78" width="22" height="27" aria-hidden="true">
          <g transform="translate(2 0)"><g transform="rotate(-9 42 72)">
            <rect x="37.5" y="4" width="9" height="13" rx="4.5" fill="#fff" />
            <rect x="34" y="15.5" width="16" height="5.5" rx="2.75" fill="rgba(255,255,255,.65)" />
            <path d="M16 36 C16 22.5 68 22.5 68 36 L68 36.5 C68 40.6 64.6 44 60.5 44 L23.5 44 C19.4 44 16 40.6 16 36.5 Z" fill="#fff" />
            <rect x="20" y="46.5" width="44" height="6" rx="3" fill="#ffd34d" />
            <path d="M23 55 L61 55 C57.5 61.5 50 64 45 70 A3.8 3.8 0 0 1 39 70 C34 64 26.5 61.5 23 55 Z" fill="#ff8ac2" />
          </g></g>
        </svg>
      </NuxtLink>

      <CommonSiteHeaderSearch dense />

      <NuxtLink to="/profile/wishlist" class="sh-mobile__btn" aria-label="Избранное">
        <Icon name="line-md:heart" class="size-[19px]" mode="svg" />
        <ClientOnly>
          <span v-if="wishlistCount > 0" class="sh-mobile__dot" />
        </ClientOnly>
      </NuxtLink>
      <NuxtLink to="/cart" class="sh-mobile__btn" aria-label="Корзина">
        <Icon name="solar:cart-3-bold" class="size-[19px]" mode="svg" />
        <ClientOnly>
          <span v-if="cartCount > 0" class="sh-mobile__dot" />
        </ClientOnly>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.sh-spacer {
  height: 74px;
}

.sh-header {
  padding: 14px 0;
}

.sh-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

/* ---- Логотип ---- */
.sh-logo {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
}

.sh-logo__badge {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  background: rgb(255 255 255 / 0.2);
  border: 1px solid rgb(255 255 255 / 0.3);
  display: grid;
  place-content: center;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.sh-logo__word {
  font: 800 22px var(--font-display);
  color: #fff;
  letter-spacing: -0.02em;
}

/* ---- Общая «стеклянная» кнопка (Каталог / иконки) ---- */
.sh-cat,
.sh-icon-btn {
  flex: none;
  border: 1px solid rgb(255 255 255 / 0.42);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.45),
    0 4px 14px rgb(0 40 120 / 0.18);
  color: #fff;
  cursor: pointer;
  backdrop-filter: blur(14px) saturate(1.6);
  -webkit-backdrop-filter: blur(14px) saturate(1.6);
  background: linear-gradient(150deg, rgb(255 255 255 / 0.3), rgb(255 255 255 / 0.12));
  transition: background 0.2s ease;
}

.sh-cat:hover,
.sh-icon-btn:hover,
.sh-cat--open {
  background: linear-gradient(150deg, rgb(255 255 255 / 0.42), rgb(255 255 255 / 0.2));
}

.sh-cat {
  height: 46px;
  padding: 0 18px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font: 600 14px var(--font-sans);
}

.sh-icon-btn {
  position: relative;
  width: 46px;
  height: 46px;
  border-radius: 999px;
  display: grid;
  place-content: center;
  text-decoration: none;
}

.sh-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  background: #ef4444;
  color: #fff;
  font: 700 11px var(--font-sans);
  display: grid;
  place-content: center;
  border: 2px solid #fff;
}

/* ---- Вход ---- */
.sh-login {
  flex: none;
  height: 46px;
  padding: 0 18px;
  border-radius: 999px;
  background: linear-gradient(150deg, rgb(255 255 255 / 0.98), rgb(255 255 255 / 0.75));
  color: var(--foreground);
  font: 700 14px var(--font-sans);
  border: 1px solid rgb(255 255 255 / 0.9);
  cursor: pointer;
  backdrop-filter: blur(12px) saturate(1.6);
  -webkit-backdrop-filter: blur(12px) saturate(1.6);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 1),
    0 6px 18px rgb(0 40 120 / 0.22);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  transition: box-shadow 0.2s ease;
}

.sh-login:hover {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 1),
    0 8px 22px rgb(0 40 120 / 0.3);
}

/* ---- Аккаунт ---- */
.sh-account {
  flex: none;
  height: 46px;
  padding: 0 14px 0 6px;
  border-radius: 999px;
  background: #fff;
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.12);
  display: inline-flex;
  align-items: center;
  gap: 9px;
  text-decoration: none;
  transition: box-shadow 0.2s ease;
}

.sh-account:hover {
  box-shadow: 0 6px 16px rgb(15 23 42 / 0.18);
}

.sh-account__avatar {
  width: 34px;
  height: 34px;
  border-radius: 999px;
  background: linear-gradient(135deg, #9333ea, #db2777);
  color: #fff;
  display: grid;
  place-content: center;
  font: 700 14px var(--font-sans);
}

.sh-account__meta {
  display: flex;
  flex-direction: column;
  line-height: 1.12;
  text-align: left;
}

.sh-account__name {
  font: 600 13px var(--font-sans);
  color: var(--foreground);
  max-width: 130px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sh-account__bonus {
  font: 700 12px var(--font-sans);
  color: var(--bonus);
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

/* ---- Скелетон аккаунта (SSR/до гидрации) ---- */
.sh-account--skeleton {
  cursor: default;
}
.sh-account__avatar--skeleton {
  background: var(--muted);
}
.sh-skel {
  display: block;
  border-radius: 5px;
  background: var(--muted);
}
.sh-skel--name {
  width: 76px;
  height: 11px;
  margin-bottom: 4px;
}
.sh-skel--bonus {
  width: 48px;
  height: 10px;
}

/* ============ Мобильная плашка ============ */
.sh-mobile {
  position: sticky;
  top: 0;
  z-index: 50;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--header-bg);
}

.sh-mobile__logo {
  flex: none;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: rgb(255 255 255 / 0.18);
  border: 1px solid rgb(255 255 255 / 0.28);
  display: grid;
  place-content: center;
}

.sh-mobile__btn {
  flex: none;
  position: relative;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: grid;
  place-content: center;
  color: #fff;
  background: rgb(255 255 255 / 0.16);
  border: 1px solid rgb(255 255 255 / 0.24);
}

.sh-mobile__dot {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: #f97316;
  border: 2px solid var(--header-bg);
}
</style>
