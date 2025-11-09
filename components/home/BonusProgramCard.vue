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
  <Card class="relative overflow-hidden border-2 border-blue-200 dark:border-blue-800 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-blue-50/50 via-purple-50/30 to-pink-50/50 dark:from-blue-950/20 dark:via-purple-950/20 dark:to-pink-950/20">
    <!-- Мягкие декоративные элементы -->
    <div class="absolute top-0 right-0 w-40 h-40 bg-blue-200/30 dark:bg-blue-800/20 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl" />
    <div class="absolute bottom-0 left-0 w-32 h-32 bg-pink-200/30 dark:bg-pink-800/20 rounded-full translate-y-1/2 -translate-x-1/2 blur-3xl" />

    <!-- Маленькие звёздочки для детского настроения -->
    <div class="absolute top-6 right-12">
      <Icon name="lucide:sparkle" class="w-4 h-4 text-yellow-400/60" />
    </div>
    <div class="absolute bottom-20 right-8">
      <Icon name="lucide:star" class="w-3 h-3 text-blue-400/60" />
    </div>

    <!-- Контент -->
    <div class="relative">
      <CardHeader class="space-y-3 pb-4">
        <!-- Иконка и заголовок -->
        <div class="flex items-start gap-3">
          <div class="flex-shrink-0 p-2.5 bg-gradient-to-br from-blue-300 to-purple-300 rounded-2xl shadow-sm">
            <Icon name="lucide:gift" class="w-5 h-5 text-white" />
          </div>
          <div class="flex-1">
            <CardTitle class="text-lg font-bold text-gray-800 dark:text-gray-100">
              Копилка бонусов 🎁
            </CardTitle>
            <CardDescription class="mt-0.5 text-sm">
              Получай подарки за покупки
            </CardDescription>
          </div>
        </div>

        <!-- Основное преимущество -->
        <div class="p-3 bg-white/80 dark:bg-gray-900/50 backdrop-blur-sm rounded-xl border-2 border-blue-100 dark:border-blue-900/50">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 bg-gradient-to-br from-yellow-200 to-orange-200 dark:from-yellow-900/40 dark:to-orange-900/40 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:coins" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground font-medium">
                Просто и понятно
              </p>
              <p class="text-lg font-bold text-blue-600 dark:text-blue-400">
                1 бонус = 1 ₸
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent class="space-y-3 pb-4">
        <!-- Преимущества с мягкими цветами -->
        <div class="space-y-2">
          <div class="flex items-center gap-2.5 p-2 bg-white/60 dark:bg-gray-900/40 rounded-lg hover:bg-white/80 dark:hover:bg-gray-900/60 transition-colors">
            <div class="w-6 h-6 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:heart" class="w-4 h-4 text-green-600 dark:text-green-400" />
            </div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
              Кэшбек с каждой покупки ✨
            </p>
          </div>
          <div class="flex items-center gap-2.5 p-2 bg-white/60 dark:bg-gray-900/40 rounded-lg hover:bg-white/80 dark:hover:bg-gray-900/60 transition-colors">
            <div class="w-6 h-6 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:smile" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
            </div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
              Оплата до 100% бонусами 🎈
            </p>
          </div>
          <div class="flex items-center gap-2.5 p-2 bg-white/60 dark:bg-gray-900/40 rounded-lg hover:bg-white/80 dark:hover:bg-gray-900/60 transition-colors">
            <div class="w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon name="lucide:star" class="w-4 h-4 text-purple-600 dark:text-purple-400" />
            </div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300">
              Бонусы не сгорают 🌟
            </p>
          </div>
        </div>

        <!-- Баланс пользователя -->
        <ClientOnly>
          <div v-if="isLoggedIn" class="mt-4">
            <div v-if="isLoading" class="h-20 flex items-center justify-center">
              <Icon name="lucide:loader-2" class="w-6 h-6 animate-spin text-blue-400" />
            </div>
            <div v-else-if="profile" class="p-4 bg-gradient-to-br from-blue-400 to-purple-400 rounded-2xl shadow-md">
              <p class="text-xs font-semibold text-white/80 mb-1">
                Ваша копилка
              </p>
              <div class="flex items-baseline gap-2">
                <p class="text-3xl font-bold text-white">
                  {{ bonusBalance }}
                </p>
                <span class="text-sm text-white/90 font-medium">бонусов</span>
              </div>
            </div>
          </div>

          <template #fallback>
            <div class="mt-4 p-4 bg-white/80 dark:bg-gray-900/60 backdrop-blur-sm rounded-2xl border-2 border-dashed border-blue-200 dark:border-blue-800">
              <div class="text-center">
                <Icon name="lucide:gift" class="w-6 h-6 text-blue-300 dark:text-blue-600 mx-auto mb-1" />
                <p class="text-xs font-medium text-gray-600 dark:text-gray-400">
                  Войдите, чтобы начать копить! 🎉
                </p>
              </div>
            </div>
          </template>
        </ClientOnly>
      </CardContent>

      <CardFooter class="flex-col gap-2 pt-3 border-t border-blue-100 dark:border-blue-900">
        <ClientOnly>
          <!-- Для авторизованных -->
          <div v-if="isLoggedIn" class="w-full space-y-2">
            <NuxtLink to="/profile/bonuses" class="block">
              <Button size="default" class="w-full bg-gradient-to-r from-blue-400 to-purple-400 hover:from-blue-500 hover:to-purple-500 text-white font-semibold shadow-sm hover:shadow-md transition-all rounded-xl text-sm">
                <Icon name="lucide:history" class="w-4 h-4 mr-2" />
                История бонусов
              </Button>
            </NuxtLink>
            <NuxtLink to="/bonus-program-rules">
              <Button variant="ghost" size="sm" class="w-full text-muted-foreground hover:text-foreground text-xs rounded-lg">
                Правила программы
                <Icon name="lucide:arrow-right" class="w-3 h-3 ml-2" />
              </Button>
            </NuxtLink>
          </div>

          <!-- Для гостей -->
          <div v-else class="w-full space-y-2">
            <Button
              size="default"
              class="w-full bg-gradient-to-r from-blue-400 to-purple-400 hover:from-blue-500 hover:to-purple-500 text-white font-semibold shadow-sm hover:shadow-md transition-all rounded-xl text-sm"
              @click="modalStore.openLoginModal()"
            >
              <Icon name="lucide:log-in" class="w-4 h-4 mr-2" />
              Войти и начать копить
            </Button>
            <NuxtLink to="/bonus-program-rules">
              <Button variant="ghost" size="sm" class="w-full text-muted-foreground hover:text-foreground text-xs rounded-lg">
                Как работает программа?
                <Icon name="lucide:arrow-right" class="w-3 h-3 ml-2" />
              </Button>
            </NuxtLink>
          </div>

          <!-- Fallback для SSR -->
          <template #fallback>
            <div class="w-full space-y-2">
              <NuxtLink to="/profile">
                <Button size="default" class="w-full bg-gradient-to-r from-blue-400 to-purple-400 hover:from-blue-500 hover:to-purple-500 text-white font-semibold shadow-sm rounded-xl text-sm">
                  <Icon name="lucide:log-in" class="w-4 h-4 mr-2" />
                  Войти или зарегистрироваться
                </Button>
              </NuxtLink>
              <NuxtLink to="/bonus-program-rules">
                <Button variant="ghost" size="sm" class="w-full text-muted-foreground hover:text-foreground text-xs rounded-lg">
                  Правила программы
                  <Icon name="lucide:arrow-right" class="w-3 h-3 ml-2" />
                </Button>
              </NuxtLink>
            </div>
          </template>
        </ClientOnly>
      </CardFooter>
    </div>
  </Card>
</template>
