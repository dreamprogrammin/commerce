<script setup lang="ts">
import type { BaseProduct } from '@/types'
import { carouselContainerVariants, sectionSpacingVariants } from '@/lib/variants'

defineProps<{
  products: BaseProduct[] | null
  title?: string
}>()

const headerContainerClass = carouselContainerVariants({ contained: 'always' })
const carouselContainerClass = carouselContainerVariants({ contained: 'desktop' })
</script>

<template>
  <section v-if="products && products.length > 0" :class="sectionSpacingVariants({ size: 'sm' })">
    <!-- Заголовок — в обычном контейнере страницы -->
    <div :class="headerContainerClass">
      <slot name="header" />
    </div>

    <!--
      Лента. Компонент самодостаточен по ширине — снаружи его оборачивать
      в контейнер НЕ нужно (иначе получится двойной padding).

      ВАЖНО: до lg на самой карусели бокового padding'а быть НЕ должно —
      её корень совпадает с окном прокрутки (overflow-hidden внутри
      CarouselContent), и любой padding здесь стал бы мёртвой полосой,
      в которой карточки пропадали бы, не доезжая до края экрана.
      Отступ живёт на флекс-ленте (см. CarouselContent ниже): в состоянии
      покоя первая карточка стоит по gutter'у, а при листании карточки
      проезжают под ним от края до края.
      На lg+ `carouselContainerClass` добавляет padding с обеих сторон —
      лента становится вровень с контейнером страницы.
    -->
    <div class="overflow-hidden">
      <Carousel
        class="w-full"
        :class="carouselContainerClass"
        :opts="{
          align: 'start',
        }"
      >
        <!--
          `pl-[var(--page-gutter)]` (до lg — там padding уже на контейнере)
          ставит первую карточку по gutter'у, а отрицательные margin'ы гасят
          её собственные отступы (`pl-2` у CarouselItem + `p-1` у обёртки):
          слева 12px до md и 4px после (там pl-0), справа всегда 4px — иначе
          в конце ленты последняя карточка не доезжает до края на эти 4px.
          Итог — видимый край карточки ровно на краю с обеих сторон.
        -->
        <CarouselContent class="pl-[var(--page-gutter)] lg:pl-0 -ml-3 md:-ml-1 -mr-1">
          <CarouselItem
            v-for="product in products"
            :key="product.id"
            class="pl-2 md:pl-0
                   basis-[52.63%]
                   sm:basis-[45%]
                   md:basis-[30%]
                   lg:basis-[22%]
                   xl:basis-[18%]"
          >
            <div class="p-1 h-full">
              <ProductCard :product="product" class="h-full" />
            </div>
          </CarouselItem>
        </CarouselContent>
      </Carousel>
    </div>
  </section>
</template>
