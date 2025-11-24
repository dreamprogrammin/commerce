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
  <div class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow duration-300 h-full flex flex-col">
    <div class="p-3 sm:p-4 flex-1 flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between mb-1 sm:mb-2">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 sm:w-9 sm:h-9 bg-blue-500 dark:bg-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center">
            <Icon name="lucide:gift" class="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 class="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
              Бонусная программа
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              Копите и экономьте
            </p>
          </div>
        </div>

        <!-- Badge -->
        <div class="flex items-center gap-1 sm:gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-2 sm:px-2.5 py-1 sm:py-1.5 border border-gray-200 dark:border-gray-700">
          <Icon name="lucide:coins" class="w-3 sm:w-3.5 h-3 sm:h-3.5 text-blue-500" />
          <span class="text-xs font-bold text-gray-900 dark:text-white">1=1₸</span>
        </div>
      </div>

      <!-- Main Content -->
      <div class="flex-1 space-y-3">
        <!-- Balance Section - Mobile First -->
        <ClientOnly>
          <div v-if="isLoggedIn">
            <div v-if="isLoading" class="h-20 sm:h-24 flex items-center justify-center bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <Icon name="lucide:loader-2" class="w-5 h-5 sm:w-6 sm:h-6 animate-spin text-blue-500" />
            </div>
            <div v-else-if="profile" class="p-2 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
              <div class="flex items-center justify-center gap-3 sm:block sm:space-y-2">
                <div class="w-12 h-12 sm:w-14 sm:h-14 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center sm:mx-auto">
                  <Icon name="lucide:wallet" class="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div class="text-left sm:text-center">
                  <p class="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Ваш баланс
                  </p>
                  <div class="flex items-baseline gap-1 sm:justify-center">
                    <p class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">
                      {{ bonusBalance }}
                    </p>
                    <span class="text-xs text-gray-500 dark:text-gray-400">бонусов</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <template #fallback>
            <div class="p-3 sm:p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 text-center">
              <div class="flex items-center justify-center gap-3 sm:block sm:space-y-2">
                <div class="w-12 h-12 sm:w-14 sm:h-14 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center sm:mx-auto">
                  <Icon name="lucide:gift" class="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div class="text-left sm:text-center">
                  <p class="text-sm sm:text-base font-bold text-gray-900 dark:text-white">
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

        <!-- Benefits - Compact on Mobile -->
        <div class="space-y-1.5 sm:space-y-2">
          <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:percent" class="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                Кешбэк с каждой покупки
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                Получайте до 10% от суммы
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:shopping-bag" class="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                Оплата до 100% бонусами
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                Используйте на следующие покупки
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="w-6 h-6 sm:w-7 sm:h-7 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:infinity" class="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white" />
            </div>
            <div class="min-w-0">
              <p class="text-xs font-semibold text-gray-900 dark:text-white truncate">
                Бонусы не сгорают
              </p>
              <p class="text-xs text-gray-600 dark:text-gray-400 hidden sm:block">
                Копите без ограничений
              </p>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions -->
      <div class="mt-3 sm:mt-4">
        <ClientOnly>
          <div v-if="isLoggedIn" class="flex w-full gap-2">
            <Button
              as-child
              class="flex-1 bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 text-sm"
            >
              <NuxtLink to="/profile/bonuses">
                <Icon name="lucide:history" class="w-3.5 h-3.5 mr-1.5" />
                История бонусов
              </NuxtLink>
            </Button>
            <Button as-child variant="outline" class="flex-1 rounded-xl h-9 text-xs">
              <NuxtLink to="/bonus-program-rules">
                <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                Правила программы
              </NuxtLink>
            </Button>
          </div>

          <div v-else class="space-y-1.5">
            <Button
              class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 text-sm"
              @click="modalStore.openLoginModal()"
            >
              <Icon name="lucide:log-in" class="w-3.5 h-3.5 mr-1.5" />
              <span class="hidden sm:inline">Войти и начать копить</span>
              <span class="sm:hidden">Войти</span>
            </Button>
            <Button as-child variant="outline" class="w-full rounded-xl h-9 text-xs">
              <NuxtLink to="/bonus-program-rules">
                <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                Как работает?
              </NuxtLink>
            </Button>
          </div>

          <template #fallback>
            <div class="space-y-1.5">
              <Button
                as-child
                class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 text-sm"
              >
                <NuxtLink to="/profile">
                  <Icon name="lucide:log-in" class="w-3.5 h-3.5 mr-1.5" />
                  <span class="hidden sm:inline">Войти или зарегистрироваться</span>
                  <span class="sm:hidden">Войти</span>
                </NuxtLink>
              </Button>
              <Button as-child variant="outline" class="w-full rounded-xl h-9 text-xs">
                <NuxtLink to="/bonus-program-rules">
                  <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                  Правила программы
                </NuxtLink>
              </Button>
            </div>
          </template>
        </ClientOnly>
      </div>
    </div>
  </div>
</template>
