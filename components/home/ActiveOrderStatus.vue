<script setup lang="ts">
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const {
  activeOrder,
  isLoading,
  getStatusColor,
  getStatusLabel,
  fetchOrders,
  subscribeToOrderUpdates,
} = useUserOrders()

const { getImageUrl } = useSupabaseStorage()

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

// Получить до 5 товаров с изображениями
const productThumbnails = computed(() => {
  if (!activeOrder.value?.order_items?.length)
    return []

  return activeOrder.value.order_items
    .slice(0, 5) // Берем до 5 товаров
    .filter(item => item.product) // Фильтруем только товары с product
    .map((item) => {
      const firstImage = item.product.product_images?.[0]
      return {
        id: item.product.id,
        name: item.product.name,
        imageUrl: firstImage?.image_url
          ? getImageUrl(BUCKET_NAME_PRODUCT, firstImage.image_url, IMAGE_SIZES.CARD)
          : null,
        blurPlaceholder: firstImage?.blur_placeholder || null,
      }
    })
})

// Форматирование даты "от 30 декабря"
const orderDate = computed(() => {
  if (!activeOrder.value?.created_at)
    return ''

  const formattedDate = new Date(activeOrder.value.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })

  return `от ${formattedDate}`
})

// Общее количество товаров
const totalItems = computed(() => {
  if (!activeOrder.value?.order_items?.length)
    return 0
  return activeOrder.value.order_items.reduce((sum, item) => sum + item.quantity, 0)
})

// Общая стоимость
const totalAmount = computed(() => {
  if (!activeOrder.value?.final_amount)
    return 0
  return activeOrder.value.final_amount.toLocaleString('ru-RU')
})
</script>

<template>
  <!-- 🔥 Компактная карточка активного заказа -->
  <NuxtLink
    v-if="!isLoading && activeOrder"
    :to="`/profile/order/${activeOrder.id}`"
    class="block mb-3 group"
  >
    <Card class="border border-orange-200 bg-white hover:shadow-md transition-all duration-200 rounded-xl overflow-hidden">
      <CardContent class="p-3">
        <!-- Шапка: Статус + Заголовок (в одну строку) -->
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 min-w-0">
            <Badge
              :class="getStatusColor(activeOrder.status)"
              class="text-[10px] px-2 py-0.5 rounded font-medium flex-shrink-0"
            >
              {{ getStatusLabel(activeOrder.status) }}
            </Badge>
            <span class="text-xs font-semibold text-gray-900 truncate">
              Заказ {{ orderDate }} №{{ activeOrder.id.slice(-6) }}
            </span>
          </div>
        </div>

        <!-- Миниатюры товаров (компактнее) -->
        <div class="flex items-center gap-1.5 mb-2 overflow-x-auto">
          <div
            v-for="(thumbnail, index) in productThumbnails"
            :key="thumbnail.id"
            class="relative flex-shrink-0 w-12 h-12 rounded-md overflow-hidden bg-gray-50 border border-gray-200"
          >
            <ProgressiveImage
              v-if="thumbnail.imageUrl"
              :src="thumbnail.imageUrl"
              :blur-data-url="thumbnail.blurPlaceholder"
              :alt="thumbnail.name"
              object-fit="contain"
              placeholder-type="lqip"
              aspect-ratio="square"
              :eager="index < 3"
              class="w-full h-full"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-gray-100"
            >
              <Icon name="lucide:package" class="w-4 h-4 text-gray-400" />
            </div>
          </div>

          <!-- Показать "+N" если товаров больше 5 -->
          <div
            v-if="activeOrder.order_items.length > 5"
            class="flex-shrink-0 w-12 h-12 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center"
          >
            <span class="text-[10px] font-semibold text-gray-600">
              +{{ activeOrder.order_items.length - 5 }}
            </span>
          </div>
        </div>

        <!-- Футер: Стоимость, количество, стрелка -->
        <div class="flex items-center justify-between pt-2 border-t border-gray-100">
          <div class="flex items-center gap-2">
            <!-- Общая стоимость -->
            <div class="flex items-center gap-1">
              <Icon name="lucide:wallet" class="w-3.5 h-3.5 text-gray-500" />
              <span class="text-xs font-semibold text-gray-900">
                {{ totalAmount }} ₸
              </span>
            </div>

            <!-- Количество товаров -->
            <Badge variant="secondary" class="text-[10px] px-1.5 py-0">
              {{ totalItems }} {{ totalItems === 1 ? 'товар' : totalItems < 5 ? 'товара' : 'товаров' }}
            </Badge>
          </div>

          <!-- Стрелка перехода -->
          <Icon
            name="lucide:arrow-right"
            class="w-4 h-4 text-gray-400 group-hover:text-orange-500 group-hover:translate-x-1 transition-all"
          />
        </div>
      </CardContent>
    </Card>
  </NuxtLink>
</template>
