<script setup lang="ts">
import { Package, Clock, Truck, CheckCircle } from 'lucide-vue-next'
import { useUserOrders } from '@/composables/orders/useUserOrders'

const {
  activeOrder,
  isLoading,
  getStatusColor,
  getStatusLabel,
  fetchOrders,
  subscribeToOrderUpdates,
} = useUserOrders()

// Подписка на обновления заказов
let channel: any = null

onMounted(async () => {
  await fetchOrders()
  channel = subscribeToOrderUpdates()
})

onUnmounted(() => {
  if (channel) {
    channel.unsubscribe()
  }
})

// Иконка в зависимости от статуса
const getStatusIcon = (status: string) => {
  switch (status) {
    case 'new':
    case 'pending':
      return Clock
    case 'processing':
      return Package
    case 'confirmed':
    case 'shipped':
      return Truck
    case 'delivered':
      return CheckCircle
    default:
      return Package
  }
}
</script>

<template>
  <div v-if="!isLoading && activeOrder" class="mb-4">
    <Card class="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
      <CardHeader>
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-3 flex-1 min-w-0">
            <div class="p-2 bg-primary/10 rounded-full flex-shrink-0">
              <component :is="getStatusIcon(activeOrder.status)" class="w-5 h-5 md:w-6 md:h-6 text-primary" />
            </div>
            <div class="min-w-0 flex-1">
              <CardTitle class="text-base md:text-lg truncate">
                Заказ №{{ activeOrder.id.slice(-6) }}
              </CardTitle>
              <CardDescription class="text-xs md:text-sm">
                от {{ new Date(activeOrder.created_at).toLocaleDateString('ru-RU') }}
              </CardDescription>
            </div>
          </div>
          <Badge :class="getStatusColor(activeOrder.status)" class="flex-shrink-0 text-xs">
            {{ getStatusLabel(activeOrder.status) }}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div class="space-y-3">
          <!-- Сумма заказа -->
          <div class="flex justify-between items-center text-sm">
            <span class="text-muted-foreground">Сумма заказа:</span>
            <span class="font-semibold">{{ activeOrder.final_amount.toLocaleString('ru-RU') }} ₸</span>
          </div>

          <!-- Товары в заказе -->
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon name="lucide:shopping-bag" class="w-4 h-4" />
            <span>{{ activeOrder.order_items.length }} {{ activeOrder.order_items.length === 1 ? 'товар' : 'товара' }}</span>
          </div>

          <!-- Кнопка просмотра -->
          <div class="pt-2">
            <Button
              as-child
              variant="default"
              size="sm"
              class="w-full"
            >
              <NuxtLink :to="`/profile/order/${activeOrder.id}`">
                Подробнее о заказе
              </NuxtLink>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
