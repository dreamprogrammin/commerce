<script setup lang="ts">
import { carouselContainerVariants } from '@/lib/variants'

/**
 * Оформление заказа: шапка, локейшн-панель, степпер и сам шаг.
 *
 * Про брейкпоинт. В макете Корзина.dc.html граница мобильного и десктопа —
 * 760px (`mob = vw < 760`), у нас же весь флоу переключается на `lg` (1024),
 * и это сделано осознанно, а не по недосмотру.
 *
 * Брейкпоинт здесь диктует не страница, а обвязка: CommonSiteHeader
 * (десктоп-строка ≥lg, компактная плашка <lg) и MobileBottomNav (`lg:hidden`)
 * живут по конвенции всего приложения. Сдвинуть на md только корзину с
 * оформлением — значит получить на 768–1023px двухколоночную десктопную
 * раскладку, зажатую между мобильной шапкой и мобильным таббаром; такого
 * состояния нет больше нигде на витрине. Единообразно мобильный планшет
 * читается лучше.
 *
 * Отсюда правило: всё разделение mob/desktop в этом флоу — только `lg`.
 * Прочие `sm:` в pages/cart.vue и pages/checkout.vue не про раскладку
 * (сетки внутри секций, сокращение подписей) и этого правила не нарушают.
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
  <div>
    <!-- Та же шапка, что на витрине: fixed + стекло при скролле. Обёртки нет
         намеренно — SiteHeader сам responsive (десктоп-строка ≥lg, компактная
         плашка <lg), а своего мобильного хедера у этого макета не было. -->
    <CommonSiteHeader />

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

    <slot />
  </div>
</template>
