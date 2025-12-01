<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import { ArrowLeft, ChevronRight, Home } from 'lucide-vue-next'

const props = defineProps<{
  items: IBreadcrumbItem[]
  compact?: boolean // 🆕 Режим для страницы товара
}>()

const isDesktop = useMediaQuery('(min-width: 768px)')

// Родительская категория (для кнопки "Назад" на мобилке)
const parentItem = computed(() => {
  // Если это первый уровень (только одна категория) - ведем на главную
  if (props.items.length === 1) {
    return { name: 'Главная', href: '/' }
  }
  // Иначе берем предпоследний элемент
  return props.items[props.items.length - 2]
})

// Текущая страница
const currentItem = computed(() => {
  return props.items[props.items.length - 1]
})
</script>

<template>
  <nav v-if="items && items.length > 0" aria-label="Breadcrumb" class="mb-4 md:mb-6">
    <!-- ДЕСКТОПНАЯ ВЕРСИЯ -->
    <div v-if="isDesktop" class="space-y-4">
      <!-- Breadcrumbs -->
      <ol class="flex items-center flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <li>
          <NuxtLink
            to="/"
            class="hover:text-primary transition-colors flex items-center gap-1.5 group"
          >
            <Home class="h-3.5 w-3.5 group-hover:scale-110 transition-transform" />
            <span>Главная</span>
          </NuxtLink>
        </li>
        <li v-for="item in items" :key="item.id" class="flex items-center">
          <ChevronRight class="h-4 w-4 mx-1 text-muted-foreground/50" />
          <NuxtLink :to="item.href" class="hover:text-primary transition-colors">
            {{ item.name }}
          </NuxtLink>
        </li>
      </ol>
    </div>

    <!-- МОБИЛЬНАЯ ВЕРСИЯ -->
    <div v-else>
      <!-- 🆕 Компактный режим (для страницы товара) -->
      <div v-if="compact" class="flex items-center">
        <NuxtLink
          :to="parentItem.href"
          class="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-all group"
        >
          <component :is="parentItem.href === '/' ? Home : ArrowLeft" class="h-4 w-4" />
          <span>{{ parentItem.name }}</span>
        </NuxtLink>
      </div>

      <!-- Полный режим (для каталога) -->
      <div v-else class="space-y-4">
        <!-- Кнопка "Назад" -->
        <NuxtLink
          :to="parentItem.href"
          class="inline-flex items-center gap-2.5 text-sm font-medium text-primary hover:text-primary/80 transition-all group"
        >
          <div class="flex items-center justify-center w-9 h-9 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-all group-active:scale-95">
            <component :is="parentItem.href === '/' ? Home : ArrowLeft" class="h-4 w-4" />
          </div>
          <span class="text-base">{{ parentItem.name }}</span>
        </NuxtLink>

        <!-- Breadcrumb trail - компактный -->
        <div class="flex items-center gap-1.5 text-xs overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
          <!-- Главная -->
          <NuxtLink
            to="/"
            class="text-muted-foreground/60 hover:text-primary transition-colors flex-shrink-0"
            aria-label="Главная"
          >
            <Home class="h-3.5 w-3.5" />
          </NuxtLink>

          <!-- Все категории -->
          <template v-for="(item, index) in items" :key="item.id">
            <ChevronRight class="h-3.5 w-3.5 text-muted-foreground/30 flex-shrink-0" />

            <!-- Последняя категория (текущая) -->
            <span
              v-if="index === items.length - 1"
              class="text-foreground/80 font-medium whitespace-nowrap"
            >
              {{ item.name }}
            </span>

            <!-- Промежуточные категории -->
            <NuxtLink
              v-else
              :to="item.href"
              class="text-muted-foreground/60 hover:text-primary transition-colors whitespace-nowrap"
            >
              {{ item.name }}
            </NuxtLink>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
/* Скрываем scrollbar для горизонтального скролла */
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.scrollbar-none::-webkit-scrollbar {
  display: none;
}
</style>
