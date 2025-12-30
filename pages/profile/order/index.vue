<script setup lang="ts">
import { Package, ShoppingBag } from 'lucide-vue-next'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const router = useRouter()
const { getPublicUrl } = useSupabaseStorage()

const {
  orders,
  isLoading,
  error,
  fetchOrders,
  subscribeToOrderUpdates,
  getStatusColor,
  getStatusLabel,
} = useUserOrders()

// Подписка на обновления
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

// Мета
definePageMeta({
  layout: 'profile',
})

useHead({
  title: 'Мои заказы',
})
</script>

<template>
  <div>
    <h1 class="text-2xl md:text-3xl font-bold mb-6">
      Мои заказы
    </h1>

    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-32 w-full" />
      <Skeleton class="h-32 w-full" />
    </div>

    <!-- Ошибка -->
    <div v-else-if="error" class="text-center py-12 space-y-4">
      <Icon name="lucide:alert-circle" class="w-16 h-16 text-destructive mx-auto" />
      <h2 class="text-xl font-semibold">Ошибка загрузки</h2>
      <p class="text-muted-foreground">{{ error }}</p>
      <Button @click="fetchOrders">
        Попробовать снова
      </Button>
    </div>

    <!-- Нет заказов -->
    <div v-else-if="!orders || orders.length === 0" class="text-center py-12 space-y-4">
      <div class="inline-flex items-center justify-center w-24 h-24 rounded-full bg-muted">
        <ShoppingBag class="w-12 h-12 text-muted-foreground" />
      </div>
      <div>
        <h2 class="text-xl font-semibold mb-2">У вас пока нет заказов</h2>
        <p class="text-muted-foreground mb-6">
          Начните покупки в нашем каталоге
        </p>
        <Button as-child>
          <NuxtLink to="/catalog/all">
            Перейти в каталог
          </NuxtLink>
        </Button>
      </div>
    </div>

    <!-- Список заказов -->
    <div v-else class="space-y-4">
      <Card
        v-for="order in orders"
        :key="order.id"
        class="cursor-pointer hover:shadow-md transition-shadow"
        @click="router.push(`/profile/order/${order.id}`)"
      >
        <CardHeader>
          <div class="flex items-start justify-between">
            <div>
              <CardTitle class="text-lg">
                Заказ №{{ order.id.slice(-6) }}
              </CardTitle>
              <CardDescription>
                {{ new Date(order.created_at).toLocaleDateString('ru-RU', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) }}
              </CardDescription>
            </div>
            <Badge :class="getStatusColor(order.status)">
              {{ getStatusLabel(order.status) }}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div class="space-y-3">
            <!-- Товары -->
            <div class="flex items-center gap-2 text-sm text-muted-foreground">
              <Package class="w-4 h-4" />
              <span>{{ order.order_items.length }} {{ order.order_items.length === 1 ? 'товар' : 'товара' }}</span>
            </div>

            <!-- Превью товаров -->
            <div class="flex gap-2 overflow-x-auto pb-2">
              <div
                v-for="item in order.order_items.slice(0, 4)"
                :key="item.id"
                class="flex-shrink-0 w-16 h-16 bg-muted rounded-lg overflow-hidden"
              >
                <ProgressiveImage
                  v-if="item.product.product_images?.[0]"
                  :src="getPublicUrl(BUCKET_NAME_PRODUCT, item.product.product_images[0].image_url)"
                  :alt="item.product.name"
                  :blur-data-url="item.product.product_images[0].blur_placeholder"
                  aspect-ratio="square"
                  object-fit="cover"
                  placeholder-type="lqip"
                  eager
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Package class="w-6 h-6 text-muted-foreground" />
                </div>
              </div>
              <div
                v-if="order.order_items.length > 4"
                class="flex-shrink-0 w-16 h-16 bg-muted rounded-lg flex items-center justify-center"
              >
                <span class="text-xs text-muted-foreground font-medium">
                  +{{ order.order_items.length - 4 }}
                </span>
              </div>
            </div>

            <!-- Сумма и бонусы -->
            <div class="flex items-center justify-between pt-2 border-t">
              <div class="text-sm">
                <span class="text-muted-foreground">Сумма заказа:</span>
              </div>
              <div class="text-right">
                <p class="font-semibold text-lg">
                  {{ order.final_amount.toLocaleString('ru-RU') }} ₸
                </p>
                <div v-if="order.bonuses_awarded > 0" class="text-xs text-green-600">
                  +{{ order.bonuses_awarded }} бонусов
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
