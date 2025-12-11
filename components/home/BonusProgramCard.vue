<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useModalStore } from '@/stores/modal/useModalStore'

const profileStore = useProfileStore()
const modalStore = useModalStore()

const { profile, isLoading, bonusBalance, isLoggedIn } = storeToRefs(profileStore)

onMounted(() => {
  if (isLoggedIn.value && !profile.value) {
    profileStore.loadProfile()
  }
})
</script>

<template>
  <div class="relative overflow-hidden rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
    <div class="p-4 flex-1 flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2 min-w-0 flex-1">
          <div class="w-9 h-9 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:gift" class="w-4.5 h-4.5 text-primary-foreground" />
          </div>
          <div class="min-w-0 flex-1">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white truncate">
              Бонусная программа
            </h3>
          </div>
        </div>
        <div class="flex items-center gap-1 bg-primary/10 dark:bg-primary/20 rounded-lg px-2 py-1 border border-primary/20 flex-shrink-0">
          <Icon name="lucide:coins" class="w-3 h-3 text-primary" />
          <span class="text-xs font-bold text-primary">1=1₸</span>
        </div>
      </div>

      <!-- Balance Section -->
      <ClientOnly>
        <div v-if="isLoggedIn" class="mb-3">
          <div v-if="isLoading" class="h-20 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin text-primary" />
          </div>
          <div v-else-if="profile" class="p-3 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20">
            <div class="flex items-center gap-2.5">
              <div class="w-11 h-11 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="lucide:wallet" class="w-5.5 h-5.5 text-primary-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-600 dark:text-gray-400 mb-0.5">
                  Ваш баланс
                </p>
                <div class="flex items-baseline gap-1">
                  <p class="text-2xl font-black text-gray-900 dark:text-white truncate">
                    {{ bonusBalance }}
                  </p>
                  <span class="text-xs text-gray-500 dark:text-gray-400">бонусов</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <template #fallback>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg mb-3">
            <div class="flex items-center gap-2.5">
              <div class="w-11 h-11 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                <Icon name="lucide:gift" class="w-5.5 h-5.5 text-primary-foreground" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gray-900 dark:text-white">
                  Начните копить
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Войдите для получения бонусов
                </p>
              </div>
            </div>
          </div>
        </template>
      </ClientOnly>

      <!-- Benefits -->
      <div class="space-y-1.5 mb-3">
        <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div class="w-7 h-7 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:percent" class="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-gray-900 dark:text-white">
              До 10% кешбэка
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div class="w-7 h-7 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:shopping-bag" class="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-gray-900 dark:text-white">
              Оплата до 100%
            </p>
          </div>
        </div>

        <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
          <div class="w-7 h-7 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <Icon name="lucide:infinity" class="w-3.5 h-3.5 text-primary-foreground" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-xs font-semibold text-gray-900 dark:text-white">
              Не сгорают
            </p>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-auto">
        <ClientOnly>
          <div v-if="isLoggedIn" class="space-y-1.5">
            <Button
              as-child
              class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold"
            >
              <NuxtLink to="/profile/bonuses">
                <Icon name="lucide:history" class="w-3.5 h-3.5 mr-1.5" />
                История бонусов
              </NuxtLink>
            </Button>
            <Button
              as-child
              variant="outline"
              class="w-full rounded-lg h-9 text-xs font-medium"
            >
              <NuxtLink to="/bonus-program-rules">
                <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                Правила
              </NuxtLink>
            </Button>
          </div>

          <div v-else class="space-y-1.5">
            <Button
              class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold"
              @click="modalStore.openLoginModal()"
            >
              <Icon name="lucide:log-in" class="w-3.5 h-3.5 mr-1.5" />
              Войти
            </Button>
            <Button
              as-child
              variant="outline"
              class="w-full rounded-lg h-9 text-xs font-medium"
            >
              <NuxtLink to="/bonus-program-rules">
                <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                Правила
              </NuxtLink>
            </Button>
          </div>

          <template #fallback>
            <div class="space-y-1.5">
              <Button
                as-child
                class="w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg h-9 text-xs font-semibold"
              >
                <NuxtLink to="/profile">
                  <Icon name="lucide:log-in" class="w-3.5 h-3.5 mr-1.5" />
                  Войти
                </NuxtLink>
              </Button>
              <Button
                as-child
                variant="outline"
                class="w-full rounded-lg h-9 text-xs font-medium"
              >
                <NuxtLink to="/bonus-program-rules">
                  <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                  Правила
                </NuxtLink>
              </Button>
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
