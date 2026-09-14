<script setup lang="ts">
/**
 * «Частые вопросы» на лендинге бренда.
 *
 * Блок ВИДИМЫЙ, и из этих же вопросов собирается разметка `FAQPage` на
 * странице. До 14 сентября 2026 разметка отдавала три общих вопроса, которых
 * на странице не было вовсе: Google такие блоки в лучшем случае игнорирует.
 *
 * Вопросы и ответы лежат в `constants/brandStaticText.ts` рядом с текстом
 * бренда — правятся в одном месте.
 */
import type { BrandFaqItem } from '@/constants/brandStaticText'

defineProps<{
  items: BrandFaqItem[]
}>()
</script>

<template>
  <section v-if="items.length" class="blf">
    <h2 class="blf__title">
      Частые вопросы
    </h2>

    <div class="blf__list">
      <div v-for="item in items" :key="item.q" class="blf__item">
        <h3 class="blf__q">
          {{ item.q }}
        </h3>
        <p class="blf__a">
          {{ item.a }}
        </p>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* @layer components — см. docs/SCOPED_STYLES_TAILWIND_LAYERS.md */
@layer components {
  .blf {
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 20px;
    background: var(--card);
    box-shadow: 0 4px 14px rgb(15 23 42 / 0.05);
  }

  .blf__title {
    margin: 0 0 14px;
    color: var(--foreground);
    font-weight: 800;
    font-size: 21px;
    letter-spacing: -0.025em;
  }

  .blf__list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .blf__item {
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border);
  }

  .blf__item:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .blf__q {
    margin: 0 0 7px;
    color: var(--foreground);
    font-weight: 700;
    font-size: 16px;
    letter-spacing: -0.01em;
    text-wrap: pretty;
  }

  .blf__a {
    margin: 0;
    color: var(--muted-foreground);
    font-size: 14.5px;
    line-height: 1.65;
    text-wrap: pretty;
  }

  @media (min-width: 760px) {
    .blf {
      padding: 30px 32px;
    }

    .blf__title {
      font-size: 26px;
    }

    .blf__q {
      font-size: 17px;
    }
  }
}
</style>
