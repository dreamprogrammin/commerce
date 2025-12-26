<script setup lang="ts">
import { Hourglass, Star } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useProfileStore } from '@/stores/core/profileStore'
import { useAuthStore } from '@/stores/core/useAuthStore'

// --- Инициализация сторов ---
const authStore = useAuthStore()
const profileStore = useProfileStore()

// --- Реактивные данные ---
const { profile, fullName, bonusBalance, isLoading, pendingBonuses } = storeToRefs(profileStore)

// --- Метаданные страницы ---
definePageMeta({
  layout: 'profile',
})

// --- SEO ---
useHead({
  title: 'Мой профиль',
})

// ✅ ИСПРАВЛЕНО: Загружаем профиль только если его еще нет
onMounted(async () => {
  console.log('[Profile Page] Mounted, checking profile...', {
    profile: !!profile.value,
    isLoading: isLoading.value
  })
  
  // ✅ Если isLoading=true больше 2 секунд - сбрасываем принудительно
  if (isLoading.value) {
    console.log('[Profile Page] Loading detected, setting timeout...')
    setTimeout(() => {
      if (isLoading.value) {
        console.warn('[Profile Page] Force resetting isLoading after timeout')
        profileStore.$patch({ isLoading: false })
      }
    }, 2000)
  }
  
  // Если профиля нет - загружаем (plugin уже мог его загрузить)
  if (!profile.value && !isLoading.value) {
    console.log('[Profile Page] No profile, loading...')
    await profileStore.loadProfile(false, true)
  } else {
    console.log('[Profile Page] Profile already loaded or loading')
  }
})

// ✅ Добавляем watch для отладки
watch(isLoading, (val, oldVal) => {
  console.log('[Profile Page] isLoading changed:', oldVal, '->', val)
})

watch(profile, (val, oldVal) => {
  console.log('[Profile Page] profile changed:', !!oldVal, '->', !!val)
})
</script>

<template>
  <div>
    <h1 class="text-2xl md:text-3xl font-bold mb-3 md:mb-6">
      Настройки профиля
    </h1>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <Skeleton class="h-40 w-full" />
      <Skeleton class="h-32 w-full" />
      <p class="text-sm text-muted-foreground text-center mt-4">
        Загрузка профиля...
      </p>
      <!-- ✅ Кнопка экстренной отмены -->
      <div class="flex justify-center mt-4">
        <Button 
          variant="outline" 
          size="sm"
          @click="() => {
            profileStore.$patch({ isLoading: false })
            profileStore.loadProfile(true, true)
          }"
        >
          Загрузка зависла? Нажмите здесь
        </Button>
      </div>
    </div>

    <!-- Профиль загружен -->
    <div v-else-if="profile" class="space-y-6">
      <div class="flex items-center justify-between">
        <h2 class="text-xl font-semibold">
          Добро пожаловать, {{ fullName }}!
        </h2>
        <Badge v-if="profile.role === 'admin'" variant="destructive">
          Администратор
        </Badge>
      </div>

      <!-- Личные данные -->
      <Card>
        <CardHeader>
          <CardTitle>Личные данные</CardTitle>
          <CardDescription>Ваша основная информация</CardDescription>
        </CardHeader>
        <CardContent class="space-y-4">
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
                        Бонусы активируются через 7 дней после подтверждения заказа.
                        Это защита от мошенничества.
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
            <p>• Приветственный бонус: 1000 бонусов после подтверждения первого заказа</p>
          </div>
        </CardContent>
      </Card>

      <!-- Действия -->
      <div class="flex flex-wrap gap-4 mt-6">
        <Button variant="outline" @click="profileStore.loadProfile(true, true)">
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
      <p class="text-sm text-muted-foreground">
        Возможно, профиль еще создается. Попробуйте обновить страницу.
      </p>
      <div class="flex gap-2 justify-center">
        <Button @click="profileStore.loadProfile(true, true)">
          Попробовать снова
        </Button>
        <Button variant="outline" @click="$router.go(0)">
          Обновить страницу
        </Button>
      </div>
    </div>
  </div>
</template>