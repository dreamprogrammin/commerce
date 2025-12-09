<script setup lang="ts">
import { CircleHelp, Hourglass, Star } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

// --- Инициализация сторов ---
const authStore = useAuthStore()
const profileStore = useProfileStore()

// --- Реактивные данные ---
const { user } = storeToRefs(authStore)
const { profile, fullName, bonusBalance, isLoading, pendingBonuses } = storeToRefs(profileStore)

// --- Метаданные страницы БЕЗ middleware ---
definePageMeta({
  layout: 'profile',
})

// --- SEO ---
useHead({
  title: 'Мой профиль',
})

// --- Загружаем профиль при монтировании ---
onMounted(async () => {
  if (user.value) {
    await profileStore.loadProfile()
  }
})
</script>

<template>
  <div>
    <h1 class="text-2xl md:text-3xl font-bold mb-3 md:mb-6">
      Настройки профиля
    </h1>

    <!-- Проверяем авторизацию прямо в шаблоне -->
    <div v-if="!user">
      <div class="text-center space-y-4">
        <h2 class="text-xl">
          Войдите в систему
        </h2>
        <p>Для просмотра профиля необходимо войти в систему</p>
        <Button @click="authStore.signInWithOAuth('google')">
          Войти через Google
        </Button>
      </div>
    </div>

    <!-- Авторизованный пользователь -->
    <div v-else>
      <!-- Загрузка -->
      <div v-if="isLoading" class="space-y-4">
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-32 w-full" />
      </div>

      <!-- Профиль загружен -->
      <div v-else-if="profile" class="space-y-6">
        <h1 class="text-2xl font-bold">
          Добро пожаловать, {{ fullName }}!
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Личные данные</CardTitle>
            <CardDescription>Ваша основная информация</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex justify-between items-center">
              <span class="text-muted-foreground">Email</span>
              <span>{{ user.email }}</span>
            </div>
            <div class="flex justify-between items-center">
              <span class="text-muted-foreground">Телефон</span>
              <span>{{ profile.phone || 'Не указан' }}</span>
            </div>
            <Button variant="outline" class="mt-4">
              Редактировать
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Мои бонусы</CardTitle>
            <CardDescription>Управляйте своими бонусами и скидками</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-2">
                <Star class="w-5 h-5 text-yellow-500" />
                <span class="font-medium">Доступно к списанию</span>
              </div>
              <Badge variant="secondary" class="text-lg">
                {{ bonusBalance }}
              </Badge>
            </div>
            <div v-if="pendingBonuses > 0" class="flex justify-between items-center">
              <div class="flex items-center gap-2 text-muted-foreground">
                <Hourglass class="w-5 h-5" />
                <span>Ожидает начисления</span>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <CircleHelp class="w-4 h-4" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Бонусы станут активны через 14 дней после получения заказа.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Badge variant="outline" class="text-md">
                {{ pendingBonuses }}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div class="flex gap-4 mt-6">
          <Button variant="outline" @click="profileStore.loadProfile()">
            Обновить данные
          </Button>
          <Button variant="destructive" @click="authStore.signOut()">
            Выйти из аккаунта
          </Button>
        </div>
      </div>

      <!-- Ошибка загрузки профиля -->
      <div v-else class="text-center space-y-4">
        <p class="text-destructive">
          Не удалось загрузить данные профиля
        </p>
        <Button @click="profileStore.loadProfile()">
          Попробовать снова
        </Button>
      </div>
    </div>
  </div>
</template>
