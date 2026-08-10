<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

defineProps<{
  /** Мобильный вид: горизонтальная лента чипсов вместо сайдбара */
  mobile?: boolean
}>()

const route = useRoute()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const { user } = storeToRefs(authStore)
const { fullName } = storeToRefs(profileStore)

const navItems = [
  { to: '/profile', icon: 'lucide:user', label: 'Профиль' },
  { to: '/profile/children', icon: 'lucide:baby', label: 'Мои дети' },
  { to: '/profile/order', icon: 'lucide:package', label: 'Мои заказы' },
  { to: '/profile/wishlist', icon: 'lucide:heart', label: 'Избранное' },
  { to: '/profile/bonuses', icon: 'lucide:gift', label: 'Бонусы' },
  { to: '/profile/settings', icon: 'lucide:settings', label: 'Настройки' },
]

const userInitial = computed(() => fullName.value?.charAt(0).toUpperCase() || 'П')

// /profile активен только при точном совпадении, остальные — вместе с вложенными роутами
function isActive(to: string) {
  return to === '/profile' ? route.path === '/profile' : route.path.startsWith(to)
}
</script>

<template>
  <!-- 📱 Мобильные чипсы -->
  <div
    v-if="mobile"
    class="hide-scrollbar flex snap-x gap-2 overflow-x-auto pb-1"
  >
    <NuxtLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="inline-flex h-10 flex-none snap-start items-center rounded-full px-4 text-[13.5px] font-bold whitespace-nowrap transition-all"
      :class="
        isActive(item.to)
          ? 'border border-transparent bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-[0_6px_16px_rgba(43,127,255,0.32)]'
          : 'border border-border bg-white text-foreground shadow-sm'
      "
    >
      {{ item.label }}
    </NuxtLink>
  </div>

  <!-- 🖥️ Десктопный сайдбар -->
  <div v-else class="flex flex-col gap-3.5">
    <!-- Карточка пользователя -->
    <div
      class="flex items-center gap-[13px] rounded-[20px] border border-border bg-white px-4 py-[15px] shadow-sm"
    >
      <span
        class="grid size-[46px] flex-none place-content-center rounded-full bg-gradient-to-br from-purple-600 to-pink-600 text-[18px] font-extrabold text-white"
      >
        <ClientOnly fallback="П">
          {{ userInitial }}
        </ClientOnly>
      </span>
      <span class="flex min-w-0 flex-col leading-tight">
        <span class="truncate text-base font-extrabold">
          <ClientOnly fallback="Загрузка...">
            {{ fullName || 'Пользователь' }}
          </ClientOnly>
        </span>
        <span class="truncate text-[13px] font-medium text-muted-foreground">
          <ClientOnly>{{ user?.email }}</ClientOnly>
        </span>
      </span>
    </div>

    <!-- Меню -->
    <nav
      class="flex flex-col gap-0.5 rounded-[20px] border border-border bg-white p-2 shadow-sm"
    >
      <NuxtLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 rounded-[13px] px-3.5 py-3 text-[15px] transition-colors"
        :class="
          isActive(item.to)
            ? 'bg-blue-50 font-extrabold text-primary'
            : 'font-semibold text-foreground hover:bg-muted'
        "
      >
        <Icon
          :name="item.icon"
          class="size-[21px] flex-none"
          :class="isActive(item.to) ? 'text-primary' : 'text-muted-foreground'"
        />
        <span class="min-w-0 flex-1">{{ item.label }}</span>
        <Icon
          v-if="isActive(item.to)"
          name="lucide:chevron-right"
          class="size-4 flex-none text-primary opacity-70"
        />
      </NuxtLink>
    </nav>

    <!-- Выход -->
    <div class="rounded-[20px] border border-border bg-white p-2 shadow-sm">
      <button
        type="button"
        class="flex w-full items-center gap-3 rounded-[13px] px-3.5 py-3 text-[15px] font-bold text-red-600 transition-colors hover:bg-red-50"
        @click="authStore.signOut()"
      >
        <Icon name="lucide:log-out" class="size-[21px] flex-none" />
        <span>Выйти</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .hide-scrollbar {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .hide-scrollbar::-webkit-scrollbar {
    display: none;
  }
}
</style>
