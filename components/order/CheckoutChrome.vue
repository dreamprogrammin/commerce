<script setup lang="ts">
import { carouselContainerVariants } from '@/lib/variants'

/**
 * Обвязка флоу оформления: локейшн-панель на узком экране и степпер на
 * широком.
 *
 * Раньше жила прямо в `layouts/Checkout.vue`. Вынесена отдельным компонентом,
 * когда корзина и оформление переехали на общую оболочку `Shell.vue`:
 * оболочка не должна знать про шаги заказа, иначе быстро станет свалкой.
 *
 * Про брейкпоинт. В макете Корзина.dc.html граница мобильного и десктопа —
 * 760px, у нас же весь флоу переключается на `lg` (1024), и это осознанно.
 * Брейкпоинт диктует не страница, а обвязка: CommonSiteHeader и
 * MobileBottomNav живут по конвенции всего приложения. Сдвинуть на md только
 * корзину с оформлением — значит получить на 768–1023px двухколоночную
 * десктопную раскладку, зажатую между мобильной шапкой и мобильным таббаром;
 * такого состояния нет больше нигде на витрине.
 */
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
  <!-- Локейшн-панель — мобильная (в макете `showLocBar: mob && step !== 3`). -->
  <div class="lg:hidden">
    <OrderLocationBar v-if="currentStep !== 3" :current-step="currentStep" />
  </div>

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
</template>
