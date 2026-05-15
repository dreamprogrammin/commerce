<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'

type OrderStatus = 'new' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'

const props = defineProps<{
  status: OrderStatus
}>()

const BASE_URL = 'https://gvsdevsvzgcivpphcuai.supabase.co/storage/v1/object/public/animations/'

const STEPS: OrderStatus[] = ['new', 'confirmed', 'processing', 'shipped', 'delivered']

const isCancelled = computed(() => props.status === 'cancelled')

const animationSrc = computed(() =>
  BASE_URL + (props.status === 'processing' || props.status === 'shipped' ? 'delivery-truck.lottie' : 'Order.lottie')
)

const statusInfo: Record<OrderStatus, { title: string; description: string }> = {
  new:        { title: 'Заказ принят',          description: 'Мы получили ваш заказ и начинаем его обработку' },
  confirmed:  { title: 'Заказ подтверждён',     description: 'Заказ подтверждён и готовится к отправке' },
  processing: { title: 'Заказ комплектуется',   description: 'Собираем ваш заказ и передаём курьеру' },
  shipped:    { title: 'Заказ в пути',          description: 'Курьер уже мчит к вам!' },
  delivered:  { title: 'Заказ доставлен',       description: 'Заказ успешно доставлен' },
  cancelled:  { title: 'Заказ отменён',         description: 'Заказ был отменён' },
}

const progressSteps = computed(() => {
  if (isCancelled.value) return STEPS.map(() => false)
  const idx = STEPS.indexOf(props.status)
  return STEPS.map((_, i) => i <= idx)
})
</script>

<template>
  <div class="flex flex-col items-center space-y-6 py-8">
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

    <div class="text-center space-y-2">
      <h3 class="text-2xl font-bold text-foreground">{{ statusInfo[status].title }}</h3>
      <p class="text-muted-foreground">{{ statusInfo[status].description }}</p>
    </div>

    <div class="w-full max-w-md">
      <div class="flex items-center gap-2">
        <div
          v-for="(isActive, index) in progressSteps"
          :key="index"
          class="flex-1 h-2 rounded-full transition-colors duration-300"
          :class="isCancelled ? 'bg-destructive/20' : isActive ? 'bg-primary' : 'bg-muted'"
        />
      </div>
      <div v-if="!isCancelled" class="flex justify-between mt-2 text-xs text-muted-foreground">
        <span>Принят</span>
        <span>Подтверждён</span>
        <span>Комплектуется</span>
        <span>В пути</span>
        <span>Доставлен</span>
      </div>
    </div>
  </div>
</template>
