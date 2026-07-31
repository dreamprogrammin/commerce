<script setup lang="ts">
import { storeToRefs } from 'pinia'
import ProfileNav from '@/components/profile/ProfileNav.vue'
import { useAuthStore } from '@/stores/core/useAuthStore'

const authStore = useAuthStore()
const { isLoggedIn } = storeToRefs(authStore)
const route = useRoute()

// Страницы, уже переведённые на новый дизайн, рисуют карточки сами.
// Остальные пока живут внутри общей карточки-обёртки — снимаем её по мере переноса.
const isBare = computed(() => route.meta.profileBare === true)

// ✅ Защита: если пользователь не авторизован - ничего не показываем
// Middleware уже откроет модальное окно и прервет навигацию

// SEO: Закрываем страницы профиля от индексации
useHead({
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})
</script>

<template>
  <!-- ✅ Показываем layout только авторизованным пользователям -->
  <div v-if="isLoggedIn" class="profile-shell min-h-screen">
    <!-- Desktop Header -->
    <div class="hidden lg:block">
      <CommonHeader />
    </div>

    <!-- Mobile: общий для сайта таббар (fixed) -->
    <div class="lg:hidden">
      <CommonAppTabBarMobile />
    </div>

    <div
      class="mx-auto w-full max-w-[1240px] px-4 pt-[76px] pb-[calc(6rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-5 lg:pb-10"
    >
      <!-- Mobile: навигация чипсами, в край экрана -->
      <div class="-mx-4 mb-3.5 sm:-mx-6 lg:hidden">
        <ProfileNav mobile class="px-4 sm:px-6" />
      </div>

      <div class="lg:flex lg:items-start lg:gap-[26px]">
        <!-- Desktop Sidebar -->
        <aside
          class="profile-scroll sticky top-5 hidden max-h-[calc(100vh-40px)] w-[264px] flex-none overflow-y-auto lg:block"
        >
          <ProfileNav />
        </aside>

        <!-- Main Content -->
        <main
          class="min-w-0 flex-1"
          :class="
            isBare
              ? ''
              : 'rounded-[18px] border border-border bg-white p-4 shadow-sm sm:p-6'
          "
        >
          <slot />
        </main>
      </div>
    </div>
  </div>

  <!-- ✅ Если не авторизован - показываем loader (на случай race condition) -->
  <div v-else class="min-h-screen flex items-center justify-center">
    <div class="text-center space-y-4">
      <div
        class="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"
      />
      <p class="text-muted-foreground">
        Проверка авторизации...
      </p>
    </div>
  </div>
</template>

<style scoped>
/* Фон из макета: blue-50 сверху, уходящий в нейтральный к 320px */
.profile-shell {
  overflow-x: clip;
  background: linear-gradient(180deg, var(--color-blue-50, oklch(0.97 0.014 254.604)), #f5f6f9 320px);
}

.profile-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.profile-scroll::-webkit-scrollbar {
  display: none;
}
</style>
