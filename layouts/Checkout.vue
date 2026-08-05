<script setup lang="ts">
const route = useRoute()

const currentStep = computed(() => {
  if (route.path.includes('/cart'))
    return 1
  if (route.path.includes('/checkout'))
    return 2
  if (route.path.includes('/order/success'))
    return 3
  return 1
})
</script>

<template>
  <div>
    <!-- Та же шапка, что на витрине: fixed + стекло при скролле. Обёртки нет
         намеренно — SiteHeader сам responsive (десктоп-строка ≥lg, компактная
         плашка <lg), а своего мобильного хедера у этого макета не было. -->
    <CommonSiteHeader />

    <!-- Checkout Stepper -->
    <div class="bg-background border-b">
      <OrderCheckoutStepper :current-step="currentStep" />
    </div>

    <slot />
  </div>
</template>
