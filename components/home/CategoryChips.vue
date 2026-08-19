<script setup lang="ts">
/**
 * Лента быстрых чипов над товарами (Homepage.dc.html: секция chips + Chips.dc.html).
 *
 * На главной чипы — это ССЫЛКИ в каталог (решение по продукту: клиентская
 * фильтрация «Хитов» в прототипе стояла в самом верху страницы, далеко от
 * сетки, и читалась как сломанная). Поэтому активной «пилюли» здесь нет —
 * просто стилизованные пилюли-ссылки; никакая из них на главной не активна.
 */
interface ChipItem {
  id: string
  label: string
  to: string
  icon?: string | null
}

defineProps<{ items: ChipItem[] }>()
</script>

<template>
  <div class="home-chips hs">
    <NuxtLink
      v-for="chip in items"
      :key="chip.id"
      :to="chip.to"
      class="home-chips__item"
    >
      <Icon v-if="chip.icon" :name="chip.icon" class="size-4" />
      {{ chip.label }}
    </NuxtLink>
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
  .home-chips {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
    width: 100%;
    /* Боковые 4px — только запас под тень крайних чипов, поэтому он гасится
       таким же отрицательным margin: видимый край первого чипа обязан лечь
       ровно на gutter страницы, как заголовки секций. */
    margin-inline: -4px;
    padding: 8px 4px;
  }

  .home-chips__item {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 38px;
    padding: 0 16px;
    border-radius: 999px;
    border: 1px solid rgba(227, 234, 245, 0.8);
    background: linear-gradient(165deg, #fff, #f3f7fc);
    box-shadow: 0 2px 8px rgb(15 23 42 / 0.06);
    color: var(--foreground);
    font-weight: 600;
    font-size: 13.5px;
    white-space: nowrap;
    text-decoration: none;
    transition:
      color 0.2s ease,
      border-color 0.2s ease,
      transform 0.1s ease;
  }

  .home-chips__item:hover {
    border-color: var(--color-blue-200);
    color: var(--primary);
  }

  .home-chips__item:active {
    transform: scale(0.96);
  }

  :global(.dark) .home-chips__item {
    border-color: var(--border);
    background: var(--card);
  }
}
</style>
