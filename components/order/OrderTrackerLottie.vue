<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'

type OrderStatus = 'new' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled'

const props = defineProps<{
  status: OrderStatus
}>()

const animationSrc = computed(() => {
  const fallbackUrl = 'https://lottie.host/embed/d6e965dc-2035-4975-a09b-8e43c239c4fd/KghlvZ7TS1.lottie'
  
  const animations = {
    new: fallbackUrl,
    confirmed: fallbackUrl,
    shipped: fallbackUrl,
    delivered: fallbackUrl,
    cancelled: fallbackUrl
  }
  
  return animations[props.status]
})

const statusTitle = computed(() => {
  const titles = {
    new: 'Заказ принят',
    confirmed: 'Заказ подтвержден',
    shipped: 'Заказ передан курьеру',
    delivered: 'Заказ доставлен',
    cancelled: 'Заказ отменен'
  }
  return titles[props.status]
})

const statusDescription = computed(() => {
  const descriptions = {
    new: 'Мы получили ваш заказ и начинаем его обработку',
    confirmed: 'Заказ подтвержден и готовится к отправке',
    shipped: 'Заказ собран и передан курьеру',
    delivered: 'Заказ успешно доставлен',
    cancelled: 'Заказ был отменен'
  }
  return descriptions[props.status]
})

const progressSteps = computed(() => {
  const steps = ['new', 'confirmed', 'shipped', 'delivered']
  const currentIndex = steps.indexOf(props.status)
  
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
