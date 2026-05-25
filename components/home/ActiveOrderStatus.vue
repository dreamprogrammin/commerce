<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { useUserOrders } from '@/composables/orders/useUserOrders'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

const user = useSupabaseUser()

// Только для авторизованных пользователей
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
  if (user.value) {
    await fetchOrders()
    channel = subscribeToOrderUpdates()
  }
})

onUnmounted(() => {
  if (channel) {
    channel.unsubscribe()
  }
})

// Получить до 5 товаров с изображениями
const productThumbnails = computed(() => {
  if (!displayOrder.value?.order_items?.length)
    return []

  return displayOrder.value.order_items
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
  if (!displayOrder.value?.created_at)
    return ''

  const formattedDate = new Date(displayOrder.value.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })

  return `от ${formattedDate}`
})

// Общее количество товаров
const totalItems = computed(() => {
  if (!displayOrder.value?.order_items?.length)
    return 0
  return displayOrder.value.order_items.reduce((sum, item) => sum + item.quantity, 0)
})

// Общая стоимость
const totalAmount = computed(() => {
  if (!displayOrder.value?.final_amount)
    return 0
  return displayOrder.value.final_amount.toLocaleString('ru-RU')
})

// 🎨 Цветовая схема в зависимости от статуса заказа
const orderColorScheme = computed(() => {
  if (!displayOrder.value)
    return null

  const status = displayOrder.value.status

  // Новый заказ (ожидание) - СИНИЙ
  if (status === 'pending') {
    return {
      border: 'border-blue-200',
      overlay: 'bg-blue-500/8',
      badge: 'bg-blue-50',
      icon: 'text-blue-500',
      indicator: 'bg-blue-500',
    }
  }

  // В обработке / подтвержден - ОРАНЖЕВЫЙ
  if (status === 'confirmed' || status === 'processing') {
    return {
      border: 'border-orange-200',
      overlay: 'bg-orange-500/8',
      badge: 'bg-orange-50',
      icon: 'text-orange-500',
      indicator: 'bg-orange-500',
    }
  }

  // Готов / доставлен - ЗЕЛЕНЫЙ
  if (status === 'delivered' || status === 'completed') {
    return {
      border: 'border-green-200',
      overlay: 'bg-green-500/8',
      badge: 'bg-green-50',
      icon: 'text-green-500',
      indicator: 'bg-green-500',
    }
  }

  // Отменен - КРАСНЫЙ
  if (status === 'cancelled') {
    return {
      border: 'border-red-200',
      overlay: 'bg-red-500/8',
      badge: 'bg-red-50',
      icon: 'text-red-500',
      indicator: 'bg-red-500',
    }
  }

  // По умолчанию - серый
  return {
    border: 'border-gray-200',
    overlay: 'bg-gray-500/8',
    badge: 'bg-gray-50',
    icon: 'text-gray-500',
    indicator: 'bg-gray-500',
  }
})

// ⏱️ Автоматическое скрытие карточки после подтверждения
const shouldShowCard = ref(true)

// 🎯 Локальная копия заказа для отображения (чтобы показывать отмененный заказ 5 секунд)
const displayOrder = ref<typeof activeOrder.value>(null)

// Флаг блокировки обновления displayOrder (когда показываем финальный статус)
const isShowingFinalStatus = ref(false)

// Обновляем displayOrder когда меняется activeOrder
watch(activeOrder, (newOrder, oldOrder) => {
  // Если показываем финальный статус - не обновляем displayOrder
  if (isShowingFinalStatus.value) {
    return
  }

  if (newOrder) {
    displayOrder.value = newOrder

    // Если это новый заказ (другой ID), показываем карточку снова
    if (!oldOrder || oldOrder.id !== newOrder.id) {
      shouldShowCard.value = true
    }
  }
}, { immediate: true })

// Когда заказ подтвержден, запускаем таймер на скрытие (10 секунд)
watch(() => displayOrder.value?.status, (newStatus, oldStatus) => {
  if (newStatus === 'confirmed' && oldStatus === 'pending') {
    // Заказ только что подтвердили - запускаем таймер на 10 секунд
    setTimeout(() => {
      shouldShowCard.value = false
    }, 10000) // 10 секунд
  }
  else if (newStatus === 'delivered' || newStatus === 'completed') {
    // Заказ доставлен - скрываем сразу
    shouldShowCard.value = false
  }
}, { immediate: true })

// Отдельный watcher для отмены заказа (используем displayOrder)
watch(() => displayOrder.value?.status, (newStatus, oldStatus) => {
  if (newStatus === 'cancelled' && oldStatus && oldStatus !== 'cancelled') {
    // Заказ только что отменили - блокируем обновления и показываем 5 секунд
    isShowingFinalStatus.value = true

    setTimeout(() => {
      shouldShowCard.value = false
      isShowingFinalStatus.value = false

      // Переключаемся на следующий активный заказ если есть
      if (activeOrder.value) {
        displayOrder.value = activeOrder.value
        shouldShowCard.value = true
      }
      else {
        displayOrder.value = null
      }
    }, 5000) // 5 секунд
  }
})
</script>

<template>
  <!-- 🔥 Красивая карточка активного заказа в стиле детских карточек -->
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="opacity-0 scale-95"
    enter-to-class="opacity-100 scale-100"
    leave-active-class="transition duration-300 ease-in"
    leave-from-class="opacity-100 scale-100"
    leave-to-class="opacity-0 scale-95"
  >
    <NuxtLink
      v-if="!isLoading && displayOrder && shouldShowCard && orderColorScheme"
      :to="`/profile/order/${displayOrder.id}`"
      class="block mb-4"
    >
      <Card
        class="order-card cursor-pointer overflow-hidden p-0 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border-2"
        :class="orderColorScheme.border"
      >
        <div class="p-4 sm:p-5 relative">
          <!-- Цветной оверлей при hover (цвет зависит от статуса) -->
          <div
            class="color-overlay absolute inset-0 opacity-0 pointer-events-none transition-opacity duration-300"
            :class="orderColorScheme.overlay"
          />

          <div class="flex items-center gap-4 relative z-10">
            <!-- Миниатюры товаров вместо аватара -->
            <div class="relative flex-shrink-0">
              <div class="product-thumbnails-container">
                <!-- Стек из 3 изображений с эффектом глубины -->
                <div class="relative w-16 h-16">
                  <div
                    v-for="(thumbnail, index) in productThumbnails.slice(0, 3)"
                    :key="thumbnail.id"
                    class="absolute rounded-xl overflow-hidden bg-white shadow-md transition-transform duration-300"
                    :class="{
                      'w-16 h-16 z-30': index === 0,
                      'w-14 h-14 z-20 top-1 left-2 opacity-80': index === 1,
                      'w-12 h-12 z-10 top-2 left-4 opacity-60': index === 2,
                    }"
                    :style="{
                      transform: `translateY(${index * 2}px) scale(${1 - index * 0.1})`,
                    }"
                  >
                    <ProgressiveImage
                      v-if="thumbnail.imageUrl"
                      :src="thumbnail.imageUrl"
                      :blur-data-url="thumbnail.blurPlaceholder"
                      :alt="thumbnail.name"
                      object-fit="contain"
                      placeholder-type="lqip"
                      aspect-ratio="square"
                      sizes="64px"
                      eager
                      class="w-full h-full"
                    />
                    <div v-else class="w-full h-full flex items-center justify-center bg-gray-100">
                      <Icon name="lucide:package" class="w-4 h-4 text-gray-400" />
                    </div>
                  </div>

                  <!-- Индикатор дополнительных товаров (цвет зависит от статуса) -->
                  <div
                    v-if="displayOrder.order_items.length > 3"
                    class="absolute -bottom-1 -right-1 z-40 w-6 h-6 rounded-full text-white flex items-center justify-center text-[10px] font-bold shadow-lg ring-2 ring-white"
                    :class="orderColorScheme.indicator"
                  >
                    +{{ displayOrder.order_items.length - 3 }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Информация о заказе -->
            <div class="flex-grow min-w-0">
              <div class="flex items-center gap-2 mb-1.5 flex-wrap">
                <!-- Статус -->
                <Badge
                  :class="getStatusColor(displayOrder.status)"
                  class="text-[11px] px-2.5 py-0.5 rounded-full font-medium"
                >
                  {{ getStatusLabel(displayOrder.status) }}
                </Badge>

                <!-- Номер заказа -->
                <h3 class="font-bold text-sm text-card-foreground">
                  №{{ displayOrder.id.slice(-6) }}
                </h3>
              </div>

              <!-- Дата и метрики -->
              <div class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <!-- Дата заказа -->
                <div class="flex items-center gap-1.5">
                  <Icon name="lucide:calendar" class="w-3.5 h-3.5" />
                  <span class="font-medium">{{ orderDate }}</span>
                </div>

                <!-- Стоимость -->
                <div class="flex items-center gap-1.5">
                  <Icon name="lucide:wallet" class="w-3.5 h-3.5" />
                  <span class="font-semibold text-gray-900">{{ totalAmount }} ₸</span>
                </div>

                <!-- Количество товаров -->
                <Badge variant="secondary" class="text-[10px] px-2 py-0.5">
                  {{ totalItems }} {{ totalItems === 1 ? 'товар' : totalItems < 5 ? 'товара' : 'товаров' }}
                </Badge>
              </div>
            </div>

            <!-- Стрелка (цвет зависит от статуса) -->
            <div class="flex-shrink-0">
              <div class="w-10 h-10 rounded-full flex items-center justify-center" :class="orderColorScheme.badge">
                <Icon
                  name="lucide:chevron-right"
                  class="chevron-icon w-5 h-5 transition-transform duration-300"
                  :class="orderColorScheme.icon"
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </NuxtLink>
  </Transition>
</template>

<style scoped>
/* Hover эффект для стрелки */
.order-card:hover .chevron-icon {
  transform: translateX(5px);
}

/* Hover эффект для оверлея */
.order-card:hover .color-overlay {
  opacity: 1;
}

/* Hover эффект для стека изображений */
.order-card:hover .product-thumbnails-container > div > div:nth-child(1) {
  transform: translateY(0) scale(1.05) rotate(-2deg);
}

.order-card:hover .product-thumbnails-container > div > div:nth-child(2) {
  transform: translateY(2px) scale(0.95) rotate(2deg);
}

.order-card:hover .product-thumbnails-container > div > div:nth-child(3) {
  transform: translateY(4px) scale(0.85) rotate(-2deg);
}

/* Active эффект (при клике) */
.order-card:active {
  transform: scale(0.98) !important;
}
</style>
