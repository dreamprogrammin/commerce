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
    <div class="p-4 flex-1 flex flex-col">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2">
          <div class="w-9 h-9 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center">
            <Icon name="lucide:gift" class="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 class="text-base font-bold text-gray-900 dark:text-white">
              Бонусная программа
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Копите и экономьте
            </p>
          </div>
        </div>

        <!-- Badge -->
        <div class="flex items-center gap-1.5 bg-gray-50 dark:bg-gray-800 rounded-lg px-2.5 py-1.5 border border-gray-200 dark:border-gray-700">
          <Icon name="lucide:coins" class="w-3.5 h-3.5 text-blue-500" />
          <span class="text-xs font-bold text-gray-900 dark:text-white">1 = 1₸</span>
        </div>
      </div>

      <!-- Main Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
        <!-- Balance Section -->
        <div class="relative bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center">
          <ClientOnly>
            <div v-if="isLoggedIn" class="text-center p-4 w-full">
              <div v-if="isLoading" class="flex items-center justify-center">
                <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-blue-500" />
              </div>
              <div v-else-if="profile" class="space-y-2.5">
                <div class="w-14 h-14 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center mx-auto">
                  <Icon name="lucide:wallet" class="w-7 h-7 text-white" />
                </div>
                <div>
                  <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-0.5">
                    Ваш баланс
                  </p>
                  <p class="text-3xl font-black text-gray-900 dark:text-white">
                    {{ bonusBalance }}
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    бонусов
                  </p>
                </div>
              </div>
            </div>

            <template #fallback>
              <div class="text-center p-4 w-full">
                <div class="w-14 h-14 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-2.5">
                  <Icon name="lucide:gift" class="w-7 h-7 text-white" />
                </div>
                <p class="text-base font-bold text-gray-900 dark:text-white mb-1">
                  Начните копить
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Войдите, чтобы получать бонусы
                </p>
              </div>
            </template>
          </ClientOnly>
        </div>

        <!-- Info Section -->
        <div class="flex flex-col justify-between space-y-3">
          <div class="space-y-2">
            <!-- Main Benefit -->
            <div class="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300">
              <Icon name="lucide:sparkles" class="w-3 h-3" />
              Программа лояльности
            </div>

            <!-- Title -->
            <div>
              <h4 class="text-base font-bold text-gray-900 dark:text-white mb-1">
                Получайте бонусы за покупки
              </h4>
              <p class="text-xs text-gray-600 dark:text-gray-400">
                Используйте их для оплаты следующих заказов
              </p>
            </div>

            <!-- Benefits -->
            <div class="space-y-1.5">
              <div class="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="w-7 h-7 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="lucide:percent" class="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p class="text-xs font-semibold text-gray-900 dark:text-white">
                    Кешбэк с каждой покупки
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    Получайте до 10% от суммы
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="w-7 h-7 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="lucide:shopping-bag" class="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p class="text-xs font-semibold text-gray-900 dark:text-white">
                    Оплата до 100% бонусами
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    Используйте на следующие покупки
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-2 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="w-7 h-7 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="lucide:infinity" class="w-3.5 h-3.5 text-white" />
                </div>
                <div>
                  <p class="text-xs font-semibold text-gray-900 dark:text-white">
                    Бонусы не сгорают
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    Копите без ограничений
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <ClientOnly>
            <div class="space-y-1.5">
              <div v-if="isLoggedIn">
                <Button
                  as-child
                  class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 text-sm"
                >
                  <NuxtLink to="/profile/bonuses">
                    <Icon name="lucide:history" class="w-3.5 h-3.5 mr-1.5" />
                    История бонусов
                  </NuxtLink>
                </Button>
                <Button as-child variant="outline" class="w-full rounded-xl h-9 text-xs mt-1.5">
                  <NuxtLink to="/bonus-program-rules">
                    <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                    Правила программы
                  </NuxtLink>
                </Button>
              </div>

              <div v-else>
                <Button
                  class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 text-sm"
                  @click="modalStore.openLoginModal()"
                >
                  <Icon name="lucide:log-in" class="w-3.5 h-3.5 mr-1.5" />
                  Войти и начать копить
                </Button>
                <Button as-child variant="outline" class="w-full rounded-xl h-9 text-xs mt-1.5">
                  <NuxtLink to="/bonus-program-rules">
                    <Icon name="lucide:info" class="w-3.5 h-3.5 mr-1.5" />
                    Как работает?
                  </NuxtLink>
                </Button>
              </div>
            </div>

            <template #fallback>
              <div class="space-y-1.5">
                <Button
                  as-child
                  class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-9 text-sm"
                >
                  <NuxtLink to="/profile">
                    <Icon name="lucide:log-in" class="w-3.5 h-3.5 mr-1.5" />
                    Войти или зарегистрироваться
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
  </div>
</template>
