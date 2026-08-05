<script setup lang="ts">
import { carouselContainerVariants } from '@/lib/variants'

const route = useRoute()

// Тот же контейнер, что у страниц шагов, — иначе вкладки степпера уезжают
// относительно колонок под ними.
const containerClass = carouselContainerVariants({ contained: 'always' })

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

    <!-- Степпер: в макете он под `sc-if notMob`, т.е. только на широких
         экранах. Полосы во всю ширину страницы у него нет — подчёркивание
         живёт на самих вкладках, поэтому обёртка без border-b. -->
    <div class="hidden lg:block">
      <div :class="containerClass">
        <div class="mx-auto w-full max-w-[1200px] pt-8">
          <OrderCheckoutStepper :current-step="currentStep" />
        </div>
      </div>
    </div>

    <slot />
  </div>
</template>
