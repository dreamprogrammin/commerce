<script setup lang="ts">
import { CheckCircle2, Package, ShoppingCart, Trash2, XCircle } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'

import TelegramBanner from '@/components/profile/TelegramBanner.vue'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useProfileStore } from '@/stores/core/profileStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const supabase = useSupabaseClient()
const cartStore = useCartStore()
const profileStore = useProfileStore()
const { profile } = storeToRefs(profileStore)

// ✅ ИСПРАВЛЕНИЕ: Используем slice(-6) для консистентности с другими страницами
const orderId = computed(() => (route.params.id as string).slice(-6)) // Последние 6 символов
const fullOrderId = computed(() => route.params.id as string)

const personalizationStore = usePersonalizationStore()

// Проверяем авторизован ли пользователь
const isAuthenticated = computed(() => !!user.value)

// Для гостей: проверяем, есть ли товары в корзине
const hasCartItems = computed(() => cartStore.items.length > 0)

// ✅ Функционал отмены заказа
const { cancelOrder, canCancelOrder } = useUserOrders()
const orderStatus = ref<string | null>(null)
const isCancelling = ref(false)
const showCancelDialog = ref(false)

// Загружаем статус заказа
async function fetchOrderStatus() {
  if (!isAuthenticated.value) return

  try {
    const { data, error } = await supabase
      .from('orders')
      .select('status')
      .eq('id', fullOrderId.value)
      .single()

    if (error) throw error
    orderStatus.value = data.status
  } catch (err) {
    console.error('Ошибка загрузки статуса:', err)
  }
}

// Обработчик отмены заказа
async function handleCancelOrder() {
  isCancelling.value = true
  const result = await cancelOrder(fullOrderId.value)

  if (result.success) {
    orderStatus.value = 'cancelled'
    showCancelDialog.value = false
  }

  isCancelling.value = false
}

// Очистка корзины для гостя
function clearGuestCart() {
  cartStore.clearCart()
  router.push('/')
}

onMounted(async () => {
  personalizationStore.invalidate()

  // Загружаем статус заказа для авторизованных пользователей
  if (isAuthenticated.value) {
    await fetchOrderStatus()
  }
})
</script>

<template>
  <div class="container max-w-2xl mx-auto py-12 px-4">
    <!-- Успешное оформление -->
    <div class="text-center mb-8">
      <div class="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
        <CheckCircle2 class="w-10 h-10 text-green-600" />
      </div>
      <h1 class="text-2xl md:text-3xl font-bold text-primary mb-2">
        Спасибо за ваш заказ!
      </h1>
      <p class="text-muted-foreground">
        Заказ успешно оформлен
      </p>
    </div>

    <!-- Карточка с информацией о заказе -->
    <Card class="mb-6">
      <CardContent class="pt-6">
        <div class="space-y-4">
          <!-- Номер заказа -->
          <div class="text-center pb-4 border-b">
            <p class="text-sm text-muted-foreground mb-2">
              Номер вашего заказа
            </p>
            <p class="text-2xl font-mono font-bold bg-muted px-4 py-2 rounded-lg inline-block">
              {{ orderId }}
            </p>
          </div>

          <!-- Что дальше -->
          <div class="space-y-3">
            <h3 class="font-semibold flex items-center gap-2">
              <Package class="w-5 h-5" />
              Что дальше?
            </h3>
            <ul class="space-y-2 text-sm text-muted-foreground">
              <li class="flex items-start gap-2">
                <span class="text-primary mt-0.5">•</span>
                <span>Наш менеджер скоро свяжется с вами для подтверждения деталей заказа</span>
              </li>
              <li class="flex items-start gap-2">
                <span class="text-primary mt-0.5">•</span>
                <span>Мы отправим уведомление о статусе заказа на указанный номер телефона</span>
              </li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>

    <!-- Информация о сохраненной корзине для гостей -->
    <Card v-if="!isAuthenticated && hasCartItems" class="mb-6 border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50">
      <CardHeader>
        <div class="flex items-start gap-3">
          <div class="p-2 bg-blue-100 rounded-full flex-shrink-0">
            <ShoppingCart class="w-5 h-5 text-blue-600" />
          </div>
          <div class="flex-1">
            <CardTitle class="text-lg">
              Корзина сохранена
            </CardTitle>
            <CardDescription class="mt-1">
              Товары в корзине остались, вы можете оформить еще один заказ или очистить корзину
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="flex gap-3">
        <NuxtLink to="/cart" class="flex-1">
          <Button variant="outline" class="w-full">
            <ShoppingCart class="w-4 h-4 mr-2" />
            Перейти в корзину
          </Button>
        </NuxtLink>
        <Button variant="ghost" size="icon" class="flex-shrink-0" @click="clearGuestCart">
          <Trash2 class="w-4 h-4" />
        </Button>
      </CardContent>
    </Card>

    <!-- Блок для авторизованных пользователей -->
    <Card v-if="isAuthenticated" class="mb-6 border-green-200 bg-gradient-to-br from-green-50 to-green-100/50">
      <CardHeader>
        <div class="flex items-start gap-3">
          <div class="p-2 bg-green-100 rounded-full flex-shrink-0">
            <Package class="w-5 h-5 text-green-600" />
          </div>
          <div class="flex-1">
            <CardTitle class="text-lg">
              Отслеживайте ваш заказ
            </CardTitle>
            <CardDescription class="mt-1">
              Статус заказа доступен в вашем личном кабинете
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent class="space-y-3">
        <NuxtLink :to="`/profile/order/${fullOrderId}`">
          <Button class="w-full" size="lg" variant="default">
            <Package class="w-4 h-4 mr-2" />
            Перейти к заказу
          </Button>
        </NuxtLink>

        <!-- ✅ Кнопка отмены заказа (только для new и confirmed) -->
        <Button
          v-if="orderStatus && canCancelOrder(orderStatus)"
          class="w-full"
          size="lg"
          variant="outline"
          @click="showCancelDialog = true"
        >
          <XCircle class="w-4 h-4 mr-2" />
          Отменить заказ
        </Button>
      </CardContent>
    </Card>

    <!-- Telegram баннер -->
    <ClientOnly>
      <TelegramBanner v-if="isAuthenticated && !profile?.telegram_chat_id" />
    </ClientOnly>

    <!-- Кнопка на главную -->
    <div class="text-center">
      <NuxtLink to="/">
        <Button variant="outline" size="lg">
          Вернуться на главную
        </Button>
      </NuxtLink>
    </div>

    <!-- ✅ Диалог подтверждения отмены -->
    <AlertDialog v-model:open="showCancelDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить заказ?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы уверены, что хотите отменить заказ №{{ orderId }}?
            <br><br>
            Потраченные бонусы будут возвращены на ваш счёт.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isCancelling">
            Нет, оставить
          </AlertDialogCancel>
          <AlertDialogAction
            :disabled="isCancelling"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            @click="handleCancelOrder"
          >
            <span v-if="isCancelling">Отменяем...</span>
            <span v-else>Да, отменить</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
