<script setup lang="ts">
import { CircleHelp, Hourglass, Link2, Star } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

// --- Инициализация сторов ---
const authStore = useAuthStore()
const profileStore = useProfileStore()

// --- Реактивные данные ---
const { user, isLoggedIn } = storeToRefs(authStore)
const { profile, fullName, bonusBalance, isLoading, pendingBonuses } = storeToRefs(profileStore)

// --- Метаданные страницы ---
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

    <!-- ✅ Гость: предлагаем войти -->
    <div v-if="!isLoggedIn">
      <div class="text-center space-y-4 py-12">
        <h2 class="text-xl font-semibold">
          Войдите в систему
        </h2>
        <p class="text-muted-foreground">
          Для просмотра профиля необходимо авторизоваться
        </p>
        <div class="space-y-3 max-w-sm mx-auto">
          <Button class="w-full" @click="authStore.signInWithOAuth('google')">
            Войти через Google
          </Button>
        </div>
      </div>
    </div>

    <!-- ✅ Авторизованный пользователь -->
    <div v-else>
      <!-- Загрузка -->
      <div v-if="isLoading" class="space-y-4">
        <Skeleton class="h-40 w-full" />
        <Skeleton class="h-32 w-full" />
      </div>

      <!-- Профиль загружен -->
      <div v-else-if="profile" class="space-y-6">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold">
            Добро пожаловать, {{ fullName }}!
          </h1>
          <Badge v-if="profile.role === 'admin'" variant="destructive">
            Администратор
          </Badge>
        </div>

        <!-- ✅ НОВЫЙ БЛОК: Привязка старых заказов -->
        <Alert class="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <Link2 class="h-5 w-5 text-blue-600" />
          <AlertTitle class="text-blue-900 dark:text-blue-100">
            Есть заказы на другой email?
          </AlertTitle>
          <AlertDescription class="space-y-3">
            <p class="text-blue-800 dark:text-blue-200">
              Если вы делали заказы на другой email адрес, вы можете привязать их к вашему аккаунту и получить бонусы за эти заказы!
            </p>
            <LinkOrdersDialog />
          </AlertDescription>
        </Alert>

        <!-- Личные данные -->
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

        <!-- Бонусная система -->
        <Card>
          <CardHeader>
            <CardTitle>Мои бонусы</CardTitle>
            <CardDescription>Управляйте своими бонусами и скидками</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Активные бонусы -->
            <div class="flex justify-between items-center p-4 bg-primary/5 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-primary/10 rounded-full">
                  <Star class="w-6 h-6 text-primary fill-primary" />
                </div>
                <div>
                  <p class="font-semibold">
                    Доступно к списанию
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Можно использовать прямо сейчас
                  </p>
                </div>
              </div>
              <Badge variant="secondary" class="text-xl px-4 py-2">
                {{ bonusBalance }}
              </Badge>
            </div>

            <!-- Ожидающие бонусы -->
            <div v-if="pendingBonuses > 0" class="flex justify-between items-center p-4 bg-muted/50 rounded-lg">
              <div class="flex items-center gap-3">
                <div class="p-2 bg-muted rounded-full">
                  <Hourglass class="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                  <p class="font-medium text-muted-foreground">
                    Ожидает активации
                  </p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger class="text-xs text-left underline decoration-dotted">
                        Когда станут доступны?
                      </TooltipTrigger>
                      <TooltipContent class="max-w-xs">
                        <p>
                          Бонусы активируются через 14 дней после регистрации
                          или получения заказа. Это защита от мошенничества.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <Badge variant="outline" class="text-lg px-4 py-2">
                {{ pendingBonuses }}
              </Badge>
            </div>

            <!-- Информация о бонусах -->
            <div class="text-sm text-muted-foreground space-y-1 pt-2">
              <p>• 1 бонус = 1 ₸ скидки при оплате</p>
              <p>• Бонусы начисляются за каждую покупку</p>
              <p>• Приветственный бонус: 1000 бонусов при регистрации</p>
            </div>
          </CardContent>
        </Card>

        <!-- Действия -->
        <div class="flex flex-wrap gap-4 mt-6">
          <Button variant="outline" @click="profileStore.loadProfile(true)">
            Обновить данные
          </Button>
          <Button variant="destructive" @click="authStore.signOut()">
            Выйти из аккаунта
          </Button>
        </div>
      </div>

      <!-- Ошибка загрузки профиля -->
      <div v-else class="text-center space-y-4 py-12">
        <p class="text-destructive">
          Не удалось загрузить данные профиля
        </p>
        <Button @click="profileStore.loadProfile(true)">
          Попробовать снова
        </Button>
      </div>
    </div>
  </div>
</template>
