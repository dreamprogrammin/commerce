<script setup lang="ts">
import { CheckCircle2, Package, ShoppingCart, Trash2 } from 'lucide-vue-next'
import { usePersonalizationStore } from '@/stores/core/personalizationStore'
import { useCartStore } from '@/stores/publicStore/cartStore'

const route = useRoute()
const router = useRouter()
const user = useSupabaseUser()
const cartStore = useCartStore()

// ✅ ИСПРАВЛЕНИЕ: Используем slice(-6) для консистентности с другими страницами
const orderId = computed(() => (route.params.id as string).slice(-6)) // Последние 6 символов
const fullOrderId = computed(() => route.params.id as string)

const personalizationStore = usePersonalizationStore()

// Проверяем авторизован ли пользователь
const isAuthenticated = computed(() => !!user.value)

// Для гостей: проверяем, есть ли товары в корзине
const hasCartItems = computed(() => cartStore.items.length > 0)

// Очистка корзины для гостя
function clearGuestCart() {
  cartStore.clearCart()
  router.push('/')
}

onMounted(() => {
  personalizationStore.invalidate()
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
      <CardContent>
        <NuxtLink :to="`/profile/order/${fullOrderId}`">
          <Button class="w-full" size="lg" variant="default">
            <Package class="w-4 h-4 mr-2" />
            Перейти к заказу
          </Button>
        </NuxtLink>
      </CardContent>
    </Card>

    <!-- Кнопка на главную -->
    <div class="text-center">
      <NuxtLink to="/">
        <Button variant="outline" size="lg">
          Вернуться на главную
        </Button>
      </NuxtLink>
    </div>
  </div>
</template>
