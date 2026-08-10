<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { carouselContainerVariants } from '@/lib/variants'

const containerClass = carouselContainerVariants({ contained: 'always' })
</script>

<template>
  <!-- Повторяет раскладку страницы товара: колонка контента + липкий блок покупки -->
  <div :class="`${containerClass} pt-[18px]`">
    <Skeleton class="mb-4 hidden h-5 w-1/2 lg:block" />

    <div class="pds-top">
      <div class="pds-col-main">
        <ProductGallerySkeleton />
      </div>

      <div class="pds-buybox">
        <div class="pds-card space-y-4">
          <Skeleton class="h-6 w-full" />
          <Skeleton class="h-6 w-2/3" />
          <Skeleton class="h-9 w-1/2" />
          <Skeleton class="h-8 w-2/3 rounded-xl" />
          <Skeleton class="h-5 w-1/3" />
          <Skeleton class="h-14 w-full rounded-2xl" />
          <Skeleton class="h-[52px] w-full rounded-2xl" />
        </div>
      </div>

      <div class="pds-col-main pds-card space-y-3">
        <Skeleton class="h-6 w-40" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-3/4" />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .pds-top {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .pds-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 22px;
    padding: 18px 16px;
    box-shadow: var(--elevation-card);
  }

  @media (width >= 64rem) {
    .pds-top {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 384px;
      column-gap: 26px;
      row-gap: 18px;
      align-items: start;
    }

    .pds-col-main {
      grid-column: 1;
    }

    .pds-buybox {
      grid-column: 2;
      grid-row: 1 / span 8;
    }

    .pds-card {
      padding: 24px 26px;
    }
  }
}
</style>
