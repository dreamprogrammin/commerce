<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <!--
    Повторяет раскладку `ProductGallery.vue`: карточка со скруглением 24,
    рельс миниатюр (снизу на мобильных, слева на десктопе) и квадратный кадр.
  -->
  <div class="pgs-card">
    <div class="pgs-rail">
      <Skeleton v-for="n in 4" :key="n" class="pgs-thumb" />
    </div>
    <Skeleton class="pgs-stage" />
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
  .pgs-card {
    display: flex;
    flex-direction: column-reverse;
    gap: 14px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 24px;
    padding: 14px;
    box-shadow: var(--elevation-card);
  }

  .pgs-rail {
    display: flex;
    flex-direction: row;
    gap: 10px;
  }

  .pgs-thumb {
    flex: none;
    width: 60px;
    height: 60px;
    border-radius: 14px;
  }

  .pgs-stage {
    flex: 1;
    min-width: 0;
    aspect-ratio: 1;
    border-radius: 22px;
  }

  @media (width >= 64rem) {
    .pgs-card {
      flex-direction: row;
      padding: 18px;
    }

    .pgs-rail {
      flex-direction: column;
    }

    .pgs-thumb {
      width: 72px;
      height: 72px;
    }
  }
}
</style>
