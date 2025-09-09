<script setup lang="ts">
import { useRecommendationsStore } from '@/stores/publicStore/recommendationsStore'

const recommendationsStore = useRecommendationsStore()

const route = useRoute()
const orderId = computed(() => (route.params.id as string).substring(0, 8)) // Показываем только часть ID

onMounted(() => {
  recommendationsStore.invalidateRecommendations()
})
</script>

<template>
  <div class="container text-center py-20 flex flex-col items-center">
    <h1 class="text-3xl font-bold text-primary">
      Спасибо за ваш заказ!
    </h1>
    <p class="mt-4 text-lg">
      Номер вашего заказа: <span class="font-mono bg-muted p-2 rounded-md">{{ orderId }}</span>
    </p>
    <p class="text-muted-foreground mt-2 max-w-md">
      Наш менеджер скоро свяжется с вами для подтверждения деталей. Вы также можете отслеживать статус заказа в личном кабинете.
    </p>
    <NuxtLink to="/">
      <Button class="mt-8">
        Вернуться на главную
      </Button>
    </NuxtLink>
  </div>
</template>
