<script setup lang="ts">
const route = useRoute()

const currentStep = computed(() => {
  if (route.path.includes('/cart')) return 1
  if (route.path.includes('/checkout')) return 2
  if (route.path.includes('/order/success')) return 3
  return 1
})
</script>

<template>
  <div>
    <div class="hidden md:block">
      <CommonHeader />
    </div>

    <!-- Checkout Stepper -->
    <div class="bg-background border-b">
      <CheckoutStepper :current-step="currentStep" />
    </div>

    <slot />
  </div>
</template>
