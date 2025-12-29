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
  <ClientOnly>
    <div v-if="!isLoading && activeOrder" class="mb-6">
      <Card class="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <div class="flex items-start justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-primary/10 rounded-full">
                <component :is="getStatusIcon(activeOrder.status)" class="w-6 h-6 text-primary" />
              </div>
              <div>
                <CardTitle class="text-lg">
                  Заказ №{{ activeOrder.id.slice(-6) }}
                </CardTitle>
                <CardDescription>
                  от {{ new Date(activeOrder.created_at).toLocaleDateString('ru-RU') }}
                </CardDescription>
              </div>
            </div>
            <Badge :class="getStatusColor(activeOrder.status)">
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

    <!-- Скелетон во время загрузки -->
    <template #fallback>
      <div class="mb-6">
        <Skeleton class="h-48 w-full rounded-lg" />
      </div>
    </template>
  </ClientOnly>
</template>
