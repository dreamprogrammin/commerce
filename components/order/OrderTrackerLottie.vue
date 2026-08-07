<script setup lang="ts">
import { DotLottieVue } from '@lottiefiles/dotlottie-vue'
import { orderStatusInfo } from '@/utils/orderStatus'

/**
 * Анимированный герой страницы успеха.
 *
 * В макете (OrderSuccess.dc.html) на этом месте стоит картинка
 * assets/images/order-success.png с подписью «Заказ принят» — но это
 * стоп-кадр: экспорт прототипа не умеет анимации. На каждый статус заказа
 * своя .lottie, и подпись с описанием меняются вместе с ней. Ту самую
 * картинку из макета используем как постер до гидратации.
 */
const props = defineProps<{
  status: string
}>()

const info = computed(() => orderStatusInfo(props.status))
</script>

<template>
  <div class="flex flex-col items-center gap-[9px]">
    <ClientOnly>
      <DotLottieVue
        :key="info.animation"
        :src="info.animation"
        :autoplay="true"
        :loop="true"
        :speed="1"
        class="otl-art"
      />
      <template #fallback>
        <!-- Стоп-кадр из макета: на сервере и до гидратации место занято
             картинкой того же размера, поэтому вёрстка не прыгает. -->
        <img
          src="/images/order-success.png"
          alt=""
          class="otl-art"
        >
      </template>
    </ClientOnly>

    <span class="text-[22px] font-extrabold leading-[1.3] tracking-[-0.02em]">
      {{ info.title }}
    </span>
    <span class="-mt-1 text-center text-[15px] leading-[1.5] text-muted-foreground">
      {{ info.description }}
    </span>
  </div>
</template>

<style scoped>
/* Размер из макета: 200px, но не шире 60% карточки на узких экранах. */
.otl-art {
  width: 200px;
  max-width: 60%;
  height: auto;
  aspect-ratio: 1;
  margin-bottom: -2px;
}
</style>
