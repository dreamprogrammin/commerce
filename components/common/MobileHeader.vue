<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, ref } from 'vue'
import { carouselContainerVariants } from '@/lib/variants'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

const container = carouselContainerVariants({ contained: 'always' })
const wishlistStore = useWishlistStore()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const modalStore = useModalStore()

const { user, isLoggedIn: isAuth } = storeToRefs(authStore)
const { fullName } = storeToRefs(profileStore)

const isVisible = ref(true)
const isSearchOpen = ref(false)
let lastScrollY = 0
let ticking = false

function handleScroll() {
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY

      if (currentScrollY < lastScrollY || currentScrollY < 100) {
        isVisible.value = true
      }
      else if (currentScrollY > lastScrollY && currentScrollY > 100) {
        isVisible.value = false
      }

      lastScrollY = currentScrollY
      ticking = false
    })

    ticking = true
  }
}

function openSearch() {
  isSearchOpen.value = true
}

// ✅ Функция открытия модального окна логина
function openLoginModal() {
  modalStore.openLoginModal()
}

const wishlistCount = computed(() => wishlistStore.wishlistProductIds.length)

onMounted(() => {
  lastScrollY = window.scrollY
  window.addEventListener('scroll', handleScroll, { passive: true })

  // Загружаем профиль если пользователь залогинен
  if (user.value) {
    profileStore.loadProfile()
  }
})

onUnmounted(() => {
  window.removeEventListener('scroll', handleScroll)
})
</script>

<template>
  <Transition
    enter-active-class="transition-transform duration-300 ease-out"
    enter-from-class="translate-y-[-100%]"
    enter-to-class="translate-y-0"
    leave-active-class="transition-transform duration-300 ease-in"
    leave-from-class="translate-y-0"
    leave-to-class="translate-y-[-100%]"
  >
    <div
      v-if="isVisible"
      class="fixed top-0 left-0 right-0 z-50 w-full bg-white dark:bg-gray-900 shadow-sm"
      :class="container"
    >
      <div class="flex items-center justify-between h-[56px]">
        <!-- Логотип -->
        <NuxtLink to="/" class="flex items-center gap-2.5">
          <div class="bg-blue-500 p-1.5 rounded-full">
            <Icon name="ic:round-toys" class="size-5 text-white" />
          </div>
          <span class="text-xl font-bold text-blue-500">
            Ухтышка
          </span>
        </NuxtLink>

        <!-- Правая часть с иконками -->
        <div class="flex items-center gap-2.5">
          <!-- Поиск -->
          <button
            class="p-1 hover:opacity-70 transition-opacity active:scale-95"
            @click="openSearch"
          >
            <Icon name="line-md:search-twotone" class="size-8 text-primary dark:text-gray-300" mode="svg"/>
          </button>

          <!-- Избранное -->
          <NuxtLink
            to="/profile/wishlist"
            class="relative p-1 hover:opacity-70 transition-opacity active:scale-95"
          >
            <Icon name="line-md:heart-filled" class="size-8 text-primary dark:text-gray-300" mode="svg" />
            <ClientOnly>
              <div
                v-if="wishlistCount > 0"
                class="absolute -top-1 -right-1 bg-red-500 text-white text-[11px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 border-2 border-white dark:border-gray-900"
              >
                {{ wishlistCount > 9 ? '9+' : wishlistCount }}
              </div>
            </ClientOnly>
          </NuxtLink>

          <!-- Уведомления -->
          <ClientOnly>
            <CommonNotificationBell v-if="isAuth" />
          </ClientOnly>

          <!-- ✅ Профиль / Логин -->
          <ClientOnly>
            <!-- Авторизованный пользователь -->
            <NuxtLink
              v-if="isAuth"
              to="/profile"
              class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors active:scale-95"
            >
              <div class="size-6 rounded-full bg-white/20 flex items-center justify-center">
                <Icon name="ic:round-account-circle" class="size-4 text-white" />
              </div>
              <span class="text-sm font-semibold text-white max-w-[80px] truncate">
                {{ fullName }}
              </span>
            </NuxtLink>

            <!-- ✅ Неавторизованный пользователь - ОТКРЫВАЕТ МОДАЛКУ -->
            <button
              v-else
              class="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 hover:bg-blue-600 rounded-full transition-colors active:scale-95"
              @click="openLoginModal"
            >
              <Icon name="ic:round-account-circle" class="size-5 text-white" />
              <span class="text-sm font-semibold text-white">
                Войти
              </span>
            </button>

            <template #fallback>
              <div class="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse">
                <div class="size-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                <div class="w-16 h-4 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </template>
          </ClientOnly>
        </div>
      </div>
    </div>
  </Transition>

  <!-- Search Drawer -->
  <SearchDrawer v-model:is-open="isSearchOpen" />
</template>
