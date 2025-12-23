<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'
import { useModalStore } from '@/stores/modal/useModalStore'
import { useCartStore } from '@/stores/publicStore/cartStore'
import { useWishlistStore } from '@/stores/publicStore/wishlistStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const wishlistStore = useWishlistStore()
const cartStore = useCartStore()
const modalStore = useModalStore()

const { user, isLoggedIn: isAuth } = storeToRefs(authStore)
const { fullName, bonusBalance, isLoggedIn: isProfileLoaded } = storeToRefs(profileStore)

const wishlistCount = computed(() => wishlistStore.wishlistProductIds.length)
const cartCount = computed(() => cartStore.items.length)
const userInitial = computed(() => fullName.value?.charAt(0) || 'П')

// Форматирование бонусов для отображения
const formattedBonus = computed(() => {
  if (!isProfileLoaded.value || bonusBalance.value === 0)
    return '0'
  return bonusBalance.value.toLocaleString('ru-KZ')
})

// ✅ Функция открытия модального окна логина
function openLoginModal() {
  modalStore.openLoginModal()
}
</script>

<template>
  <div class="py-3 md:py-4">
    <div class="flex items-center justify-between gap-4">
      <!-- Logo -->
      <NuxtLink
        to="/"
        class="flex items-center gap-2.5 md:gap-3 group transition-transform hover:scale-105 active:scale-95"
      >
        <div class="bg-gradient-to-br from-blue-500 to-blue-600 p-2 md:p-2.5 rounded-xl md:rounded-2xl shadow-lg shadow-blue-500/30 group-hover:shadow-blue-500/50 transition-shadow">
          <Icon name="lucide:toy-brick" class="size-5 md:size-6 text-white" />
        </div>
        <span class="text-xl md:text-2xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 dark:from-blue-400 dark:to-blue-300 md:from-white md:to-white/90 bg-clip-text text-transparent">
          Ухтышка
        </span>
      </NuxtLink>

      <!-- Action Buttons -->
      <div class="flex items-center gap-2 md:gap-3">
        <!-- Wishlist -->
        <NuxtLink
          to="/profile/wishlist"
          class="relative group"
        >
          <div class="p-2 md:p-2.5 bg-gray-100 dark:bg-gray-800 md:bg-white/10 hover:bg-gray-200 dark:hover:bg-gray-700 md:hover:bg-white/20 rounded-xl transition-all group-hover:scale-105 active:scale-95 backdrop-blur-sm md:border md:border-white/10 md:hover:border-white/20 md:shadow-lg">
            <Icon
              name="lucide:heart"
              class="size-5 md:size-5.5 text-gray-700 dark:text-gray-300 md:text-white"
            />
          </div>
          <ClientOnly>
            <Transition
              enter-active-class="transition-all duration-200"
              enter-from-class="scale-0 opacity-0"
              enter-to-class="scale-100 opacity-100"
            >
              <div
                v-if="wishlistCount > 0"
                class="absolute -top-1 -right-1 bg-gradient-to-r from-red-500 to-pink-500 text-white text-[10px] md:text-[11px] font-bold rounded-full min-w-[18px] md:min-w-[20px] h-[18px] md:h-[20px] flex items-center justify-center px-1 border-2 border-white dark:border-gray-900 md:border-blue-500 shadow-lg"
              >
                {{ wishlistCount > 9 ? '9+' : wishlistCount }}
              </div>
            </Transition>
          </ClientOnly>
        </NuxtLink>

        <!-- Cart -->
        <NuxtLink
          to="/cart"
          class="relative group"
        >
          <div class="p-2 md:p-2.5 bg-gray-100 dark:bg-gray-800 md:bg-white/10 hover:bg-gray-200 dark:hover:bg-gray-700 md:hover:bg-white/20 rounded-xl transition-all group-hover:scale-105 active:scale-95 backdrop-blur-sm md:border md:border-white/10 md:hover:border-white/20 md:shadow-lg">
            <Icon
              name="lucide:shopping-bag"
              class="size-5 md:size-5.5 text-gray-700 dark:text-gray-300 md:text-white"
            />
          </div>
          <ClientOnly>
            <Transition
              enter-active-class="transition-all duration-200"
              enter-from-class="scale-0 opacity-0"
              enter-to-class="scale-100 opacity-100"
            >
              <div
                v-if="cartCount > 0"
                class="absolute -top-1 -right-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-[10px] md:text-[11px] font-bold rounded-full min-w-[18px] md:min-w-[20px] h-[18px] md:h-[20px] flex items-center justify-center px-1 border-2 border-white dark:border-gray-900 md:border-blue-500 shadow-lg"
              >
                {{ cartCount > 9 ? '9+' : cartCount }}
              </div>
            </Transition>
          </ClientOnly>
        </NuxtLink>

        <!-- ✅ Cashback Button - ТОЛЬКО для авторизованных -->
        <NuxtLink
          v-if="isAuth"
          to="/profile/bonus"
          class="hidden md:flex items-center gap-2.5 px-4 py-2.5 bg-white/10 hover:bg-white/20 rounded-xl transition-all hover:scale-105 active:scale-95 backdrop-blur-sm border border-white/10 hover:border-white/20 shadow-lg group"
        >
          <div class="relative">
            <Icon name="lucide:star" class="size-5 text-yellow-400 group-hover:text-yellow-300 transition-colors" />
            <div v-if="bonusBalance > 0" class="absolute -top-0.5 -right-0.5 w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
          </div>
          <div class="flex flex-col items-start">
            <span class="text-[10px] text-white/60 leading-none mb-0.5">Бонусы</span>
            <span class="text-sm font-bold text-white leading-none">{{ formattedBonus }} ₸</span>
          </div>
        </NuxtLink>

        <!-- ✅ Profile Button / Login Button -->
        <ClientOnly>
          <!-- Авторизованный пользователь -->
          <NuxtLink
            v-if="isAuth"
            to="/profile"
            class="group"
          >
            <div
              class="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 md:from-white/10 md:to-white/10 md:hover:from-white/20 md:hover:to-white/20 rounded-xl md:rounded-2xl shadow-lg md:shadow-lg transition-all group-hover:scale-105 active:scale-95 md:backdrop-blur-sm md:border md:border-white/10 md:hover:border-white/20"
            >
              <div class="size-6 md:size-7 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center font-bold text-white text-sm border border-white/30">
                {{ userInitial }}
              </div>
              <span class="hidden md:block text-sm font-semibold text-white max-w-[120px] truncate">
                {{ fullName }}
              </span>
            </div>
          </NuxtLink>

          <!-- ✅ Неавторизованный пользователь - ОТКРЫВАЕТ МОДАЛКУ -->
          <button
            v-else
            class="group"
            @click="openLoginModal"
          >
            <div
              class="flex items-center gap-2 px-3 md:px-4 py-2 md:py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 md:from-white/10 md:to-white/10 md:hover:from-white/20 md:hover:to-white/20 rounded-xl md:rounded-2xl transition-all group-hover:scale-105 active:scale-95 md:backdrop-blur-sm md:border md:border-white/10 md:hover:border-white/20 md:shadow-lg"
            >
              <Icon
                name="lucide:user"
                class="size-5 text-white"
              />
              <span class="hidden md:block text-sm font-semibold text-white">
                Войти
              </span>
            </div>
          </button>

          <template #fallback>
            <div class="flex items-center gap-2 px-4 py-2.5 bg-gray-100/50 dark:bg-gray-800/50 md:bg-white/10 rounded-2xl animate-pulse md:backdrop-blur-sm">
              <div class="size-7 rounded-full bg-gray-200 dark:bg-gray-700 md:bg-white/20" />
              <div class="hidden md:block w-20 h-4 bg-gray-200 dark:bg-gray-700 md:bg-white/20 rounded" />
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
