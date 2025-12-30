<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
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

// Получить первое изображение первого товара
const firstProductImage = computed(() => {
  if (!activeOrder.value?.order_items?.length) return null
  const firstProduct = activeOrder.value.order_items[0]?.product
  if (!firstProduct?.product_images?.length) return null
  return firstProduct.product_images[0]
})

// URL изображения
const productImageUrl = computed(() => {
  if (!firstProductImage.value?.image_url) {
    console.log('❌ ActiveOrderStatus: Нет image_url', {
      activeOrder: activeOrder.value,
      orderItems: activeOrder.value?.order_items,
      firstProduct: activeOrder.value?.order_items?.[0]?.product,
    })
    return null
  }

  const url = getImageUrl(BUCKET_NAME_PRODUCT, firstProductImage.value.image_url, IMAGE_SIZES.PRODUCT_CARD)
  console.log('✅ ActiveOrderStatus: URL изображения сгенерирован', {
    imageUrl: firstProductImage.value.image_url,
    generatedUrl: url,
    blurPlaceholder: firstProductImage.value.blur_placeholder,
  })
  return url
})
</script>

<template>
  <!-- 🔥 Компактная горизонтальная плашка активного заказа -->
  <NuxtLink
    v-if="!isLoading && activeOrder"
    :to="`/profile/order/${activeOrder.id}`"
    class="block mb-3 group"
  >
    <Card class="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10 hover:shadow-md transition-all duration-200">
      <CardContent class="p-3">
        <div class="flex items-center gap-3">
          <!-- Изображение первого товара -->
          <div class="relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0 rounded-lg overflow-hidden bg-white">
            <ProgressiveImage
              v-if="productImageUrl"
              :src="productImageUrl"
              :blur-data-url="firstProductImage?.blur_placeholder || undefined"
              :alt="activeOrder.order_items[0]?.product?.name || 'Товар'"
              object-fit="cover"
              placeholder-type="lqip"
              aspect-ratio="square"
              :eager="true"
              class="w-full h-full"
            />
            <div
              v-else
              class="w-full h-full flex items-center justify-center bg-gray-100"
            >
              <Icon name="lucide:package" class="w-6 h-6 text-gray-400" />
            </div>
          </div>

          <!-- Информация о заказе -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-semibold text-sm md:text-base truncate">
                Заказ №{{ activeOrder.id.slice(-6) }}
              </span>
              <Badge :class="getStatusColor(activeOrder.status)" class="text-xs px-2 py-0 h-5">
                {{ getStatusLabel(activeOrder.status) }}
              </Badge>
            </div>
            <div class="flex items-center gap-2 text-xs md:text-sm text-muted-foreground">
              <span class="font-medium text-foreground">
                {{ activeOrder.final_amount.toLocaleString('ru-RU') }} ₸
              </span>
              <span class="hidden sm:inline">•</span>
              <span class="hidden sm:inline">
                {{ activeOrder.order_items.length }} {{ activeOrder.order_items.length === 1 ? 'товар' : activeOrder.order_items.length < 5 ? 'товара' : 'товаров' }}
              </span>
            </div>
          </div>

          <!-- Стрелка -->
          <ArrowRight class="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  </NuxtLink>
</template>
