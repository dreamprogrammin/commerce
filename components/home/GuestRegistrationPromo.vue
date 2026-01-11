<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { useModalStore } from '@/stores/modal/useModalStore'

const user = useSupabaseUser()
const modalStore = useModalStore()

// Проверяем, гость ли пользователь
const isGuest = computed(() => !user.value)

// Медиа-запрос для определения мобильного устройства
const isMobile = useMediaQuery('(max-width: 768px)')

// Состояние показа промо (Dialog или Drawer)
const showPromo = ref(false)

// Проверяем localStorage - показывали ли промо в этой сессии
const STORAGE_KEY = 'guest_promo_shown'

onMounted(() => {
  // Показываем только гостям
  if (!isGuest.value) return

  // Проверяем, показывали ли уже в этой сессии
  const wasShown = sessionStorage.getItem(STORAGE_KEY)
  if (wasShown) return

  // Показываем с небольшой задержкой для лучшего UX
  setTimeout(() => {
    showPromo.value = true
    sessionStorage.setItem(STORAGE_KEY, 'true')
  }, 3000) // 3 секунды после загрузки
})

// Открытие модального окна авторизации
const handleLoginClick = () => {
  showPromo.value = false
  modalStore.openLoginModal()
}

// Закрытие промо
const handleClose = () => {
  showPromo.value = false
}
</script>

<template>
  <div>
    <!-- Desktop: Dialog -->
    <Dialog v-if="!isMobile" v-model:open="showPromo">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80">
            <Icon name="lucide:sparkles" class="h-8 w-8 text-white" />
          </div>
          <DialogTitle class="text-center text-2xl">
            Получайте больше с бонусной программой!
          </DialogTitle>
          <DialogDescription class="text-center">
            Зарегистрируйтесь и начните копить бонусы за каждую покупку
          </DialogDescription>
        </DialogHeader>

        <!-- Преимущества -->
        <div class="space-y-3 py-4">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Icon name="lucide:gift" class="w-5 h-5 text-orange-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Бонусы за покупки</h4>
              <p class="text-sm text-muted-foreground">Получайте до 10% бонусами от суммы заказа</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Icon name="lucide:package" class="w-5 h-5 text-blue-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Отслеживание заказов</h4>
              <p class="text-sm text-muted-foreground">Следите за статусом доставки в режиме реального времени</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center">
              <Icon name="lucide:heart" class="w-5 h-5 text-pink-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Список избранного</h4>
              <p class="text-sm text-muted-foreground">Сохраняйте понравившиеся товары</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Icon name="lucide:star" class="w-5 h-5 text-green-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Персональные рекомендации</h4>
              <p class="text-sm text-muted-foreground">Подборки товаров специально для вас</p>
            </div>
          </div>
        </div>

        <!-- Кнопки -->
        <DialogFooter class="flex-col sm:flex-row gap-2">
          <Button variant="outline" @click="handleClose" class="w-full sm:w-auto">
            Может позже
          </Button>
          <Button @click="handleLoginClick" class="w-full sm:w-auto">
            <Icon name="lucide:user-plus" class="w-4 h-4 mr-2" />
            Зарегистрироваться
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Mobile: Drawer -->
    <Drawer v-else v-model:open="showPromo">
      <DrawerContent>
        <DrawerHeader>
          <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80">
            <Icon name="lucide:sparkles" class="h-8 w-8 text-white" />
          </div>
          <DrawerTitle class="text-center text-xl">
            Получайте больше с бонусной программой!
          </DrawerTitle>
          <DrawerDescription class="text-center">
            Зарегистрируйтесь и начните копить бонусы за каждую покупку
          </DrawerDescription>
        </DrawerHeader>

        <!-- Преимущества -->
        <div class="px-4 space-y-3 pb-4">
          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
              <Icon name="lucide:gift" class="w-5 h-5 text-orange-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Бонусы за покупки</h4>
              <p class="text-sm text-muted-foreground">Получайте до 10% бонусами от суммы заказа</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Icon name="lucide:package" class="w-5 h-5 text-blue-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Отслеживание заказов</h4>
              <p class="text-sm text-muted-foreground">Следите за статусом доставки в режиме реального времени</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-pink-100 flex items-center justify-center">
              <Icon name="lucide:heart" class="w-5 h-5 text-pink-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Список избранного</h4>
              <p class="text-sm text-muted-foreground">Сохраняйте понравившиеся товары</p>
            </div>
          </div>

          <div class="flex items-start gap-3">
            <div class="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Icon name="lucide:star" class="w-5 h-5 text-green-600" />
            </div>
            <div class="flex-1">
              <h4 class="font-medium">Персональные рекомендации</h4>
              <p class="text-sm text-muted-foreground">Подборки товаров специально для вас</p>
            </div>
          </div>
        </div>

        <!-- Кнопки -->
        <DrawerFooter>
          <Button @click="handleLoginClick">
            <Icon name="lucide:user-plus" class="w-4 h-4 mr-2" />
            Зарегистрироваться
          </Button>
          <DrawerClose as-child>
            <Button variant="outline" @click="handleClose">
              Может позже
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </div>
</template>
