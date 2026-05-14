<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'

type OrderStatus = 'new' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

const props = defineProps<{
  status: OrderStatus
}>()

const BASE_URL = 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/animations/'

const animationSrc = computed(() => {
  const fileNames: Record<OrderStatus, string> = {
    new: 'Order.lottie',
    confirmed: 'Order.lottie',
    processing: 'delivery-truck.lottie',
    shipped: 'delivery-truck.lottie',
    delivered: 'Order.lottie',
    cancelled: 'Order.lottie'
  }
  
  const fileName = fileNames[props.status] || 'Order.lottie'
  return BASE_URL + fileName
})

const statusTitle = computed(() => {
  const titles: Record<OrderStatus, string> = {
    new: 'Заказ принят',
    confirmed: 'Заказ подтвержден',
    processing: 'Заказ в пути',
    shipped: 'Заказ в пути',
    delivered: 'Заказ доставлен',
    cancelled: 'Заказ отменен'
  }
  return titles[props.status] || 'Заказ'
})

const statusDescription = computed(() => {
  const descriptions: Record<OrderStatus, string> = {
    new: 'Мы получили ваш заказ и начинаем его обработку',
    confirmed: 'Заказ подтвержден и готовится к отправке',
    processing: 'Курьер уже мчит к вам!',
    shipped: 'Курьер уже мчит к вам!',
    delivered: 'Заказ успешно доставлен',
    cancelled: 'Заказ был отменен'
  }
  return descriptions[props.status] || ''
})

const progressSteps = computed(() => {
  const steps = ['new', 'confirmed', 'processing', 'delivered']
  const currentIndex = steps.indexOf(props.status === 'shipped' ? 'processing' : props.status)
  
  if (props.status === 'cancelled') {
    return steps.map(() => false)
  }
  
  return steps.map((_, index) => index <= currentIndex)
})
</script>

<template>
  <div class="flex flex-col items-center space-y-6 py-8">
    <!-- Lottie Animation -->
    <ClientOnly>
      <DotLottieVue
        :src="animationSrc"
        :autoplay="true"
        :loop="true"
        :speed="1"
        style="width: 250px; height: 250px;"
      />
      <template #fallback>
        <div class="w-[250px] h-[250px] bg-muted animate-pulse rounded-full" />
      </template>
    </ClientOnly>

    <!-- Status Title -->
    <div class="text-center space-y-2">
      <h3 class="text-2xl font-bold text-foreground">
        {{ statusTitle }}
      </h3>
      <p class="text-muted-foreground">
        {{ statusDescription }}
      </p>
    </div>

    <!-- Progress Bar -->
    <div v-if="status !== 'cancelled'" class="w-full max-w-md">
      <div class="flex items-center gap-2">
        <div
          v-for="(isActive, index) in progressSteps"
          :key="index"
          class="flex-1 h-2 rounded-full transition-colors duration-300"
          :class="isActive ? 'bg-primary' : 'bg-muted'"
        />
      </div>
      <div class="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>Принят</span>
        <span>Подтвержден</span>
        <span>В пути</span>
        <span>Доставлен</span>
      </div>
    </div>

    <!-- Cancelled State -->
    <div v-else class="w-full max-w-md">
      <div class="flex items-center gap-2">
        <div
          v-for="index in 4"
          :key="index"
          class="flex-1 h-2 rounded-full bg-destructive/20"
        />
      </div>
    </div>
  </div>
</template>
