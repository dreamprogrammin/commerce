<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { carouselContainerVariants } from '@/lib/variants'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

const authStore = useAuthStore()
const profileStore = useProfileStore()
const { fullName } = storeToRefs(profileStore)
const alwaysContainedClass = carouselContainerVariants({ contained: 'always' })

const navItems = [
  { to: '/profile', icon: 'lucide:user', label: 'Мой профиль' },
  { to: '/profile/children', icon: 'lucide:smile', label: 'Мои дети' },
  { to: '/profile/order', icon: 'lucide:shopping-bag', label: 'Мои заказы' },
  { to: '/profile/wishlist', icon: 'lucide:heart', label: 'Избранное' },
  { to: '/profile/bonus', icon: 'lucide:star', label: 'Бонусы' },
  { to: '/profile/settings', icon: 'lucide:settings', label: 'Настройки' },
]
</script>

<template>
  <div :class="`${alwaysContainedClass} mx-auto px-4 py-8`">
    <div class="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-8">
      <!-- Боковая панель -->
      <aside class="flex flex-col space-y-6">
        <div class="space-y-4">
          <div class="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>
                <ClientOnly fallback="П">
                  {{ fullName.charAt(0) || 'П' }}
                </ClientOnly>
              </AvatarFallback>
            </Avatar>
            <span class="font-semibold text-lg">
              <ClientOnly fallback="Загрузка...">
                {{ fullName || 'Пользователь' }}
              </ClientOnly>
            </span>
          </div>

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

        <!-- Кнопка выхода -->
        <div class="mt-auto pt-4 border-t">
          <Button
            variant="ghost"
            class="w-full justify-start text-destructive hover:text-destructive"
            @click="authStore.signOut()"
          >
            <Icon name="lucide:log-out" class="w-4 h-4 mr-2" />
            Выйти
          </Button>
        </div>
      </aside>

      <!-- Основной контент -->
      <main class="bg-background rounded-xl border p-6 min-h-[600px]">
        <slot />
      </main>
    </div>
  </div>
</template>
