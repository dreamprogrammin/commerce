<script setup lang="ts">
import { Package, Calendar, CreditCard, MapPin, Gift, XCircle } from 'lucide-vue-next'
import type { UserOrder } from '@/composables/orders/useUserOrders'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const route = useRoute()
const router = useRouter()
const supabase = useSupabaseClient()
const { getImageUrl } = useSupabaseStorage()

const orderId = route.params.id as string

const { getStatusColor, getStatusLabel, subscribeToOrderUpdates, cancelOrder, canCancelOrder } = useUserOrders()

// Состояние для отмены
const isCancelling = ref(false)
const showCancelDialog = ref(false)

// Загрузка заказа
const order = ref<UserOrder | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)

const fetchOrder = async () => {
  isLoading.value = true
  error.value = null

  try {
    const { data, error: fetchError } = await supabase
      .from('orders')
      .select(`
        id,
        created_at,
        status,
        final_amount,
        delivery_method,
        payment_method,
        delivery_address,
        bonuses_spent,
        bonuses_awarded,
        order_items(
          id,
          quantity,
          product:products(
            id,
            name,
            price,
            product_images(
              image_url,
              blur_placeholder
            )
          )
        )
      `)
      .eq('id', orderId)
      .single()

    if (fetchError) throw fetchError

    order.value = data as UserOrder
  } catch (err: any) {
    console.error('Ошибка загрузки заказа:', err)
    error.value = err.message

    // Если заказ не найден, редирект на список заказов
    if (err.code === 'PGRST116') {
      setTimeout(() => {
        router.push('/profile/order')
      }, 2000)
    }
  } finally {
    isLoading.value = false
  }
}

// Подписка на обновления
let channel: any = null

onMounted(async () => {
  await fetchOrder()
  channel = subscribeToOrderUpdates()
})

onUnmounted(() => {
  if (channel) {
    channel.unsubscribe()
  }
})

// Форматирование адреса доставки
const formatAddress = (address: any) => {
  if (!address) return 'Не указан'
  if (typeof address === 'string') return address

  const parts = []
  if (address.city) parts.push(address.city)
  if (address.street) parts.push(address.street)
  if (address.building) parts.push(`д. ${address.building}`)
  if (address.apartment) parts.push(`кв. ${address.apartment}`)

  return parts.length > 0 ? parts.join(', ') : 'Не указан'
}

// Метод доставки
const deliveryMethodLabel = computed(() => {
  if (!order.value) return ''

  const method = order.value.delivery_method
  switch (method) {
    case 'delivery':
      return 'Доставка курьером'
    case 'pickup':
      return 'Самовывоз'
    default:
      return method
  }
})

// Метод оплаты
const paymentMethodLabel = computed(() => {
  if (!order.value?.payment_method) return 'Не указан'

  const method = order.value.payment_method
  switch (method) {
    case 'cash':
      return 'Наличными'
    case 'card':
      return 'Картой'
    case 'kaspi':
      return 'Каспи'
    default:
      return method
  }
})

// Обработчик отмены заказа
const handleCancelOrder = async () => {
  if (!order.value) return

  isCancelling.value = true
  const result = await cancelOrder(order.value.id)

  if (result.success) {
    // Обновляем локальный order
    await fetchOrder()
    showCancelDialog.value = false
  }

  isCancelling.value = false
}

// Получить URL изображения товара
function getProductImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl) return null
  return getImageUrl(BUCKET_NAME_PRODUCT, imageUrl, IMAGE_SIZES.THUMBNAIL)
}

// Мета
definePageMeta({
  layout: 'profile',
})

useHead({
  title: `Заказ №${orderId.slice(-6)}`,
})
</script>

<template>
  <div>
    <!-- Загрузка -->
    <div v-if="isLoading" class="space-y-4">
      <Skeleton class="h-10 w-1/2" />
      <Skeleton class="h-64 w-full" />
      <Skeleton class="h-48 w-full" />
    </div>

    <!-- Ошибка -->
    <div v-else-if="error" class="text-center py-12 space-y-4">
      <Icon name="lucide:alert-circle" class="w-16 h-16 text-destructive mx-auto" />
      <h2 class="text-xl font-semibold">Заказ не найден</h2>
      <p class="text-muted-foreground">{{ error }}</p>
      <Button @click="router.push('/profile/order')">
        Вернуться к списку заказов
      </Button>
    </div>

    <!-- Содержимое -->
    <div v-else-if="order" class="space-y-6">
      <!-- Заголовок -->
      <div class="flex items-start justify-between">
        <div>
          <h1 class="text-2xl md:text-3xl font-bold mb-2">
            Заказ №{{ order.id.slice(-6) }}
          </h1>
          <div class="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar class="w-4 h-4" />
            <span>{{ new Date(order.created_at).toLocaleString('ru-RU') }}</span>
          </div>
        </div>
        <Badge :class="getStatusColor(order.status)" class="text-base px-4 py-2">
          {{ getStatusLabel(order.status) }}
        </Badge>
      </div>

      <!-- Информация о заказе -->
      <div class="grid md:grid-cols-2 gap-6">
        <!-- Детали заказа -->
        <Card>
          <CardHeader>
            <CardTitle>Детали заказа</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Доставка -->
            <div class="flex items-start gap-3">
              <Package class="w-5 h-5 text-muted-foreground mt-0.5" />
              <div class="flex-1">
                <p class="text-sm font-medium">Способ доставки</p>
                <p class="text-sm text-muted-foreground">{{ deliveryMethodLabel }}</p>
              </div>
            </div>

            <!-- Адрес -->
            <div v-if="order.delivery_method === 'delivery'" class="flex items-start gap-3">
              <MapPin class="w-5 h-5 text-muted-foreground mt-0.5" />
              <div class="flex-1">
                <p class="text-sm font-medium">Адрес доставки</p>
                <p class="text-sm text-muted-foreground">{{ formatAddress(order.delivery_address) }}</p>
              </div>
            </div>

            <!-- Оплата -->
            <div class="flex items-start gap-3">
              <CreditCard class="w-5 h-5 text-muted-foreground mt-0.5" />
              <div class="flex-1">
                <p class="text-sm font-medium">Способ оплаты</p>
                <p class="text-sm text-muted-foreground">{{ paymentMethodLabel }}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- Стоимость -->
        <Card>
          <CardHeader>
            <CardTitle>Стоимость</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <!-- Итого -->
            <div class="flex justify-between items-center text-lg font-semibold">
              <span>Итого:</span>
              <span>{{ order.final_amount.toLocaleString('ru-RU') }} ₸</span>
            </div>

            <!-- Бонусы -->
            <div v-if="order.bonuses_spent > 0 || order.bonuses_awarded > 0" class="pt-4 border-t space-y-2">
              <div v-if="order.bonuses_spent > 0" class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2 text-orange-600">
                  <Gift class="w-4 h-4" />
                  <span>Списано бонусов</span>
                </div>
                <span class="font-medium text-orange-600">-{{ order.bonuses_spent }}</span>
              </div>
              <div v-if="order.bonuses_awarded > 0" class="flex items-center justify-between text-sm">
                <div class="flex items-center gap-2 text-green-600">
                  <Gift class="w-4 h-4" />
                  <span>Начислено бонусов</span>
                </div>
                <span class="font-medium text-green-600">+{{ order.bonuses_awarded }}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Товары в заказе -->
      <Card>
        <CardHeader>
          <CardTitle>Товары ({{ order.order_items.length }})</CardTitle>
        </CardHeader>
        <CardContent>
          <div class="space-y-4">
            <div
              v-for="item in order.order_items"
              :key="item.id"
              class="flex gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
            >
              <!-- Изображение -->
              <div class="flex-shrink-0 w-20 h-20 bg-muted rounded-lg overflow-hidden">
                <ProgressiveImage
                  v-if="item.product.product_images?.[0] && getProductImageUrl(item.product.product_images[0].image_url)"
                  :src="getProductImageUrl(item.product.product_images[0].image_url)"
                  :alt="item.product.name"
                  :blur-data-url="item.product.product_images[0].blur_placeholder"
                  :bucket-name="BUCKET_NAME_PRODUCT"
                  :file-path="item.product.product_images[0].image_url"
                  aspect-ratio="square"
                  object-fit="cover"
                  placeholder-type="lqip"
                  eager
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Package class="w-8 h-8 text-muted-foreground" />
                </div>
              </div>

              <!-- Информация -->
              <div class="flex-1 min-w-0">
                <h3 class="font-medium text-sm mb-1 truncate">
                  {{ item.product.name }}
                </h3>
                <p class="text-sm text-muted-foreground">
                  {{ item.product.price.toLocaleString('ru-RU') }} ₸ × {{ item.quantity }}
                </p>
              </div>

              <!-- Сумма -->
              <div class="flex-shrink-0 text-right">
                <p class="font-semibold">
                  {{ (item.product.price * item.quantity).toLocaleString('ru-RU') }} ₸
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Кнопки управления -->
      <div class="pt-4 flex flex-wrap gap-3">
        <Button variant="outline" @click="router.push('/profile/order')">
          <Icon name="lucide:arrow-left" class="w-4 h-4 mr-2" />
          Вернуться к списку заказов
        </Button>

        <!-- Кнопка отмены (только для new и confirmed) -->
        <Button
          v-if="canCancelOrder(order.status)"
          variant="destructive"
          @click="showCancelDialog = true"
        >
          <XCircle class="w-4 h-4 mr-2" />
          Отменить заказ
        </Button>
      </div>
    </div>

    <!-- Диалог подтверждения отмены -->
    <AlertDialog v-model:open="showCancelDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Отменить заказ?</AlertDialogTitle>
          <AlertDialogDescription>
            Вы уверены, что хотите отменить заказ №{{ orderId.slice(-6) }}?
            <br><br>
            Потраченные бонусы будут возвращены на ваш счёт.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel :disabled="isCancelling">
            Нет, оставить
          </AlertDialogCancel>
          <AlertDialogAction
            @click="handleCancelOrder"
            :disabled="isCancelling"
            class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            <span v-if="isCancelling">Отменяем...</span>
            <span v-else>Да, отменить</span>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
