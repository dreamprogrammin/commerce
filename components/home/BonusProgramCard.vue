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
  <div class="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 hover:shadow-lg transition-shadow duration-300">
    <div class="p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-2">
          <div class="w-10 h-10 bg-blue-500 dark:bg-blue-600 rounded-xl flex items-center justify-center">
            <Icon name="lucide:gift" class="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 class="text-lg font-bold text-gray-900 dark:text-white">
              Бонусная программа
            </h3>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Копите и экономьте
            </p>
          </div>
        </div>

        <!-- Badge -->
        <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-xl px-3 py-2 border border-gray-200 dark:border-gray-700">
          <Icon name="lucide:coins" class="w-4 h-4 text-blue-500" />
          <span class="text-sm font-bold text-gray-900 dark:text-white">1 = 1₸</span>
        </div>
      </div>

      <!-- Main Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Balance Section -->
        <div class="relative aspect-square bg-gray-50 dark:bg-gray-800 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex items-center justify-center">
          <ClientOnly>
            <div v-if="isLoggedIn" class="text-center p-6 w-full">
              <div v-if="isLoading" class="flex items-center justify-center">
                <Icon name="lucide:loader-2" class="w-8 h-8 animate-spin text-blue-500" />
              </div>
              <div v-else-if="profile" class="space-y-4">
                <div class="w-20 h-20 bg-blue-500 dark:bg-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                  <Icon name="lucide:wallet" class="w-10 h-10 text-white" />
                </div>
                <div>
                  <p class="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Ваш баланс
                  </p>
                  <p class="text-4xl font-black text-gray-900 dark:text-white">
                    {{ bonusBalance }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    бонусов
                  </p>
                </div>
              </div>
            </div>

            <template #fallback>
              <div class="text-center p-6 w-full">
                <div class="w-20 h-20 bg-blue-500 dark:bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Icon name="lucide:gift" class="w-10 h-10 text-white" />
                </div>
                <p class="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  Начните копить
                </p>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Войдите, чтобы получать бонусы
                </p>
              </div>
            </template>
          </ClientOnly>
        </div>

        <!-- Info Section -->
        <div class="flex flex-col justify-between space-y-4">
          <div class="space-y-3">
            <!-- Main Benefit -->
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-medium text-gray-700 dark:text-gray-300">
              <Icon name="lucide:sparkles" class="w-3 h-3" />
              Программа лояльности
            </div>

            <!-- Title -->
            <div>
              <h4 class="text-xl font-bold text-gray-900 dark:text-white mb-2">
                Получайте бонусы за покупки
              </h4>
              <p class="text-sm text-gray-600 dark:text-gray-400">
                Используйте их для оплаты следующих заказов
              </p>
            </div>

            <!-- Benefits -->
            <div class="space-y-2">
              <div class="flex items-start gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="lucide:percent" class="w-4 h-4 text-white" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">
                    Кешбэк с каждой покупки
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    Получайте до 10% от суммы заказа
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="lucide:shopping-bag" class="w-4 h-4 text-white" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">
                    Оплата до 100% бонусами
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    Используйте на следующие покупки
                  </p>
                </div>
              </div>

              <div class="flex items-start gap-2.5 p-2.5 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="w-8 h-8 bg-blue-500 dark:bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon name="lucide:infinity" class="w-4 h-4 text-white" />
                </div>
                <div>
                  <p class="text-sm font-semibold text-gray-900 dark:text-white">
                    Бонусы не сгорают
                  </p>
                  <p class="text-xs text-gray-600 dark:text-gray-400">
                    Копите без ограничений по времени
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Actions -->
          <ClientOnly>
            <div class="space-y-2">
              <div v-if="isLoggedIn">
                <Button
                  as-child
                  class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-11"
                >
                  <NuxtLink to="/profile/bonuses">
                    <Icon name="lucide:history" class="w-4 h-4 mr-2" />
                    История бонусов
                  </NuxtLink>
                </Button>
                <Button as-child variant="outline" class="w-full rounded-xl mt-2">
                  <NuxtLink to="/bonus-program-rules">
                    <Icon name="lucide:info" class="w-4 h-4 mr-2" />
                    Правила программы
                  </NuxtLink>
                </Button>
              </div>

              <div v-else>
                <Button
                  class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-11"
                  @click="modalStore.openLoginModal()"
                >
                  <Icon name="lucide:log-in" class="w-4 h-4 mr-2" />
                  Войти и начать копить
                </Button>
                <Button as-child variant="outline" class="w-full rounded-xl mt-2">
                  <NuxtLink to="/bonus-program-rules">
                    <Icon name="lucide:info" class="w-4 h-4 mr-2" />
                    Как работает?
                  </NuxtLink>
                </Button>
              </div>
            </div>

            <template #fallback>
              <div class="space-y-2">
                <Button
                  as-child
                  class="w-full bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white rounded-xl h-11"
                >
                  <NuxtLink to="/profile">
                    <Icon name="lucide:log-in" class="w-4 h-4 mr-2" />
                    Войти или зарегистрироваться
                  </NuxtLink>
                </Button>
                <Button as-child variant="outline" class="w-full rounded-xl">
                  <NuxtLink to="/bonus-program-rules">
                    <Icon name="lucide:info" class="w-4 h-4 mr-2" />
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
