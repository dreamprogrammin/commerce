<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types'
import { ChevronRight } from 'lucide-vue-next'

defineProps<{
  items: IBreadcrumbItem[]
}>()
</script>

<template>
  <nav v-if="items && items.length > 0" aria-label="breadcrumb">
    <ol class="flex items-center space-x-2 text-sm text-muted-foreground flex-wrap">
      <!-- Статичная ссылка на главную страницу, всегда первая -->
      <li>
        <NuxtLink to="/" class="hover:text-primary transition-colors">
          Главная
        </NuxtLink>
      </li>

      <!-- Цикл по всем элементам, переданным в компонент -->
      <template v-for="(item, index) in items" :key="item.id">
        <li class="flex items-center">
          <!-- Иконка-разделитель -->
          <ChevronRight class="h-4 w-4 shrink-0" />

          <!-- Если это последний элемент, делаем его неактивным текстом -->
          <span
            v-if="index === items.length - 1"
            class="ml-2 font-medium text-foreground"
            aria-current="page"
          >
            {{ item.name }}
          </span>

          <!-- Иначе, делаем его кликабельной ссылкой -->
          <NuxtLink
            v-else-if="item.href"
            :to="item.href"
            class="ml-2 hover:text-primary transition-colors"
          >
            {{ item.name }}
          </NuxtLink>

          <!-- Запасной вариант, если у промежуточного элемента нет href -->
          <span v-else class="ml-2">{{ item.name }}</span>
        </li>
      </template>
    </ol>
  </nav>
</template>
