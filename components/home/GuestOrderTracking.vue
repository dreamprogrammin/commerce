<script setup lang="ts">
import { Search, Package, X } from 'lucide-vue-next'
import { useGuestOrder } from '@/composables/orders/useGuestOrder'

const {
  order,
  isLoading,
  error,
  trackOrder,
  subscribeToOrderUpdates,
  loadTrackedOrder,
  clearTrackedOrder,
  getStatusColor,
  getStatusLabel,
} = useGuestOrder()

const orderId = ref('')
const email = ref('')
const showForm = ref(true)

let channel: any = null

// При монтировании - пробуем загрузить последний отслеживаемый заказ
onMounted(async () => {
  await loadTrackedOrder()

  if (order.value) {
    showForm.value = false
    channel = subscribeToOrderUpdates(order.value.id)
  }
})

onUnmounted(() => {
  if (channel) {
    channel.unsubscribe()
  }
})

// Поиск заказа
const handleTrackOrder = async () => {
  await trackOrder(orderId.value, email.value)

  if (order.value) {
    showForm.value = false
    channel = subscribeToOrderUpdates(order.value.id)
  }
}

// Очистить и показать форму снова
const handleClear = () => {
  clearTrackedOrder()
  showForm.value = true
  orderId.value = ''
  email.value = ''

  if (channel) {
    channel.unsubscribe()
    channel = null
  }
}
</script>

<template>
  <div>
    <!-- Форма поиска заказа -->
    <Card v-if="showForm && !order" class="border-dashed">
      <CardHeader>
        <div class="flex items-center gap-2 md:gap-3">
          <div class="p-2 bg-blue-100 rounded-full flex-shrink-0">
            <Search class="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
          </div>
          <div class="min-w-0 flex-1">
            <CardTitle class="text-base md:text-lg">Отследить заказ</CardTitle>
            <CardDescription class="text-xs md:text-sm">
              Введите номер заказа и email для отслеживания статуса
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <form @submit.prevent="handleTrackOrder" class="space-y-4">
          <!-- Номер заказа -->
          <div class="space-y-2">
            <Label for="orderId" class="text-xs md:text-sm">Номер заказа</Label>
            <Input
              id="orderId"
              v-model="orderId"
              placeholder="Введите номер заказа"
              required
              :disabled="isLoading"
              class="text-sm md:text-base"
            />
            <p class="text-[10px] md:text-xs text-muted-foreground">
              Номер заказа указан в подтверждении
            </p>
          </div>

          <!-- Email -->
          <div class="space-y-2">
            <Label for="email" class="text-xs md:text-sm">Email</Label>
            <Input
              id="email"
              v-model="email"
              type="email"
              placeholder="your@email.com"
              required
              :disabled="isLoading"
              class="text-sm md:text-base"
            />
          </div>

          <!-- Ошибка -->
          <Alert v-if="error" variant="destructive">
            <Icon name="lucide:alert-circle" class="w-4 h-4" />
            <AlertTitle class="text-sm">Ошибка</AlertTitle>
            <AlertDescription class="text-xs md:text-sm">{{ error }}</AlertDescription>
          </Alert>

          <!-- Кнопка -->
          <Button type="submit" :disabled="isLoading" class="w-full text-sm md:text-base">
            <Search class="w-4 h-4 mr-2" v-if="!isLoading" />
            <Icon name="lucide:loader-2" class="w-4 h-4 mr-2 animate-spin" v-else />
            {{ isLoading ? 'Поиск...' : 'Найти заказ' }}
          </Button>
        </form>
      </CardContent>
    </Card>

    <!-- Найденный заказ -->
    <Card v-if="order" class="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <div class="flex items-start gap-2">
          <div class="p-2 bg-primary/10 rounded-full flex-shrink-0">
            <Package class="w-5 h-5 md:w-6 md:h-6 text-primary" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <CardTitle class="text-base md:text-lg truncate">
                  Заказ №{{ order.id.slice(-6) }}
                </CardTitle>
                <CardDescription class="text-xs md:text-sm">
                  от {{ new Date(order.created_at).toLocaleDateString('ru-RU') }}
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="h-8 w-8 flex-shrink-0"
                @click="handleClear"
              >
                <X class="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div class="space-y-4">
          <!-- Статус -->
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs md:text-sm text-muted-foreground">Статус:</span>
            <Badge :class="getStatusColor(order.status)" class="text-xs">
              {{ getStatusLabel(order.status) }}
            </Badge>
          </div>

          <!-- Получатель -->
          <div class="flex items-center justify-between gap-2 text-xs md:text-sm">
            <span class="text-muted-foreground">Получатель:</span>
            <span class="font-medium truncate">{{ order.guest_name }}</span>
          </div>

          <!-- Сумма -->
          <div class="flex items-center justify-between gap-2 text-xs md:text-sm">
            <span class="text-muted-foreground">Сумма заказа:</span>
            <span class="font-semibold">{{ order.final_amount.toLocaleString('ru-RU') }} ₸</span>
          </div>

          <!-- Товары -->
          <div class="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
            <Icon name="lucide:shopping-bag" class="w-4 h-4" />
            <span>{{ order.items.length }} {{ order.items.length === 1 ? 'товар' : 'товара' }}</span>
          </div>

          <!-- Описание статуса -->
          <div v-if="order.status === 'processing'" class="p-2 md:p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p class="text-xs md:text-sm text-yellow-800">
              ⚙️ Ваш заказ в обработке. Мы скоро свяжемся с вами для подтверждения.
            </p>
          </div>
          <div v-else-if="order.status === 'confirmed'" class="p-2 md:p-3 bg-green-50 border border-green-200 rounded-lg">
            <p class="text-xs md:text-sm text-green-800">
              ✅ Заказ подтверждён и готовится к отправке!
            </p>
          </div>
          <div v-else-if="order.status === 'shipped'" class="p-2 md:p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <p class="text-xs md:text-sm text-indigo-800">
              🚚 Заказ отправлен и уже в пути к вам!
            </p>
          </div>
          <div v-else-if="order.status === 'delivered'" class="p-2 md:p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <p class="text-xs md:text-sm text-purple-800">
              ✨ Заказ доставлен! Спасибо за покупку!
            </p>
          </div>
          <div v-else-if="order.status === 'cancelled'" class="p-2 md:p-3 bg-red-50 border border-red-200 rounded-lg">
            <p class="text-xs md:text-sm text-red-800">
              ❌ Заказ отменён.
            </p>
          </div>

          <!-- Контакты -->
          <div class="pt-3 border-t text-[10px] md:text-xs text-muted-foreground">
            <p>При возникновении вопросов звоните: +7 702 537 94 73</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
