<script setup lang="ts">
import type { BaseProduct } from '@/types'
import { sectionSpacingVariants } from '@/lib/variants'

/**
 * Секция «лента товаров» на главной.
 *
 * Ширину себе НЕ задаёт: и скелетон, и ProductCarousel самодостаточны
 * (заголовок в контейнере 'always', лента — контейнер 'desktop' + отступ
 * внутри самой ленты).
 * Оборачивать этот компонент снаружи в контейнер нельзя — будет двойной padding.
 */
const props = defineProps<{
  products: BaseProduct[] | null
  isLoading: boolean
  title: string
  seeAllLink: string
}>()
</script>

<template>
  <!-- 1. Если идет загрузка, показываем скелетон -->
  <ProductCarouselSectionSkeleton v-if="isLoading" :title="props.title" />

  <!-- 2. Если загрузка завершена И есть товары, показываем карусель -->
  <section v-else-if="products && products.length > 0" :class="sectionSpacingVariants({ size: 'xs' })">
    <ProductCarousel :products="products">
      <template #header>
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-xl md:text-3xl font-bold tracking-tight">
            {{ props.title }}
          </h2>
          <Button v-if="products.length > 4" as-child variant="link">
            <!--
              Стрелка — ИКОНКА, а не символ `&rarr;` (U+2192).

              Этого символа нет ни в одном подключённом подмножестве шрифта:
              в `latin` у Google есть U+2191 и U+2193 (↑ и ↓), а U+2192 (→) —
              нет. Единственные грани Nunito, которые его покрывают, —
              несокращённые легаси-`.woff`, и браузер тянул их целиком ради
              одной стрелки. Замер 25 августа 2026 на главной: 106 КБ из
              188 КБ всех шрифтов уходило на это, при том что глифа там всё
              равно нет и стрелка рисовалась системным шрифтом.

              Иконка Lucide — та же, что в «Все категории» у
              PopularCategories.
            -->
            <NuxtLink :to="props.seeAllLink" class="inline-flex items-center gap-1.5">
              Смотреть все
              <Icon name="lucide:arrow-right" class="size-4" />
            </NuxtLink>
          </Button>
        </div>
      </template>
    </ProductCarousel>
  </section>

  <!-- 3. Если загрузка завершена, но товаров нет, НЕ показываем ничего -->
</template>
