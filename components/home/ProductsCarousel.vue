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
            <NuxtLink :to="props.seeAllLink">
              Смотреть все &rarr;
            </NuxtLink>
          </Button>
        </div>
      </template>
    </ProductCarousel>
  </section>

  <!-- 3. Если загрузка завершена, но товаров нет, НЕ показываем ничего -->
</template>
