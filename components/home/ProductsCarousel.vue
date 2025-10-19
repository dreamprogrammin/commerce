<script setup lang="ts">
import type { BaseProduct } from '@/types'

const props = defineProps<{
  products: BaseProduct[] | null
  isLoading: boolean
  title: string
  seeAllLink: string // И ссылку "Смотреть все" тоже принимаем
}>()
</script>

<template>
  <!--
    Теперь у нас нет лишней обертки.
    Мы сразу начинаем с логики отображения.
  -->

  <!-- Если идет загрузка, показываем скелетон с заголовком -->
  <div v-if="isLoading" class="container py-8 md:py-12">
    <h2 class="text-2xl md:text-3xl font-bold tracking-tight mb-8">
      {{ props.title }}
    </h2>
    <ProductCarouselSkeleton />
  </div>

  <!--
    Если загрузка завершена И есть товары,
    показываем нашу универсальную карусель.
  -->
  <ProductCarousel v-else-if="products && products.length > 0" :products="products">
    <template #header>
      <div class="flex justify-between items-center mb-8">
        <h2 class="text-2xl md:text-3xl font-bold tracking-tight">
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

  <!--
    Блок `v-else` здесь не нужен, так как если товаров нет,
    компонент просто ничего не отрендерит, что является правильным поведением.
    Мы не хотим показывать "Ничего не найдено" для каждого блока на главной.
  -->
</template>
