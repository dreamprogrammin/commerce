<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import { ChevronLeft, ChevronRight, Home } from 'lucide-vue-next'

const props = defineProps<{
  items: IBreadcrumbItem[]
}>()

const isDesktop = useMediaQuery('(min-width: 768px)')

// Родительская категория (предпоследний элемент)
const parentItem = computed(() => {
  if (props.items.length < 2) {
    return null
  }
  return props.items[props.items.length - 2]
})

// Текущая страница (последний элемент)
const currentItem = computed(() => {
  if (props.items.length === 0) {
    return null
  }
  return props.items[props.items.length - 1]
})
</script>

<template>
  <nav v-if="items && items.length > 0" aria-label="Breadcrumb" class="mb-6">
    <!-- ДЕСКТОПНАЯ ВЕРСИЯ -->
    <div v-if="isDesktop">
      <ol class="flex items-center space-x-2 text-sm text-muted-foreground">
        <!-- Главная -->
        <li>
          <NuxtLink
            to="/"
            class="hover:text-primary transition-colors flex items-center gap-1.5"
          >
            <Home class="h-3.5 w-3.5" />
            <span>Главная</span>
          </NuxtLink>
        </li>

        <!-- Все элементы пути -->
        <li v-for="(item, index) in items" :key="item.id">
          <div class="flex items-center">
            <ChevronRight class="h-4 w-4 mx-1" />
            <!-- Последний элемент не является ссылкой -->
            <NuxtLink
              v-if="index < items.length - 1"
              :to="item.href"
              class="hover:text-primary transition-colors"
            >
              {{ item.name }}
            </NuxtLink>
            <span
              v-else
              class="text-foreground font-medium"
            >
              {{ item.name }}
            </span>
          </div>
        </li>
      </ol>
    </div>

    <!-- МОБИЛЬНАЯ ВЕРСИЯ - Вертикальная -->
    <div v-else class="space-y-3">
      <!-- Кнопка "Назад" к родительской категории -->
      <NuxtLink
        v-if="parentItem"
        :to="parentItem.href"
        class="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
      >
        <ChevronLeft class="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
        <span>{{ parentItem.name }}</span>
      </NuxtLink>

      <!-- Текущая страница -->
      <h1
        v-if="currentItem"
        class="text-2xl font-bold text-foreground"
      >
        {{ currentItem.name }}
      </h1>
    </div>
  </nav>
</template>
