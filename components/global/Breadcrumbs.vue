<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import { ChevronRight, MoreHorizontal } from 'lucide-vue-next'

const props = defineProps<{
  items: IBreadcrumbItem[]
}>()

const isDesktop = useMediaQuery('(min-width: 768px)')

// Только промежуточные элементы для дропдауна (без главной и последних двух)
const dropdownItems = computed<IBreadcrumbItem[]>(() => {
  if (props.items.length <= 2) {
    return []
  }
  // Берем все элементы кроме последних двух (категория и товар)
  return props.items.slice(0, -2)
})

// Предпоследний элемент - это КАТЕГОРИЯ (откуда пришел товар)
const categoryItem = computed(() => {
  if (props.items.length < 2) {
    return null
  }
  return props.items[props.items.length - 2]
})
</script>

<template>
  <nav v-if="items && items.length > 0" aria-label="Breadcrumb">
    <!-- ДЕСКТОПНАЯ ВЕРСИЯ -->
    <ol v-if="isDesktop" class="flex items-center space-x-2 text-sm text-muted-foreground">
      <li>
        <NuxtLink to="/" class="hover:text-primary transition-colors">
          Главная
        </NuxtLink>
      </li>
      <li v-for="item in items" :key="item.id">
        <div class="flex items-center">
          <ChevronRight class="h-4 w-4" />
          <NuxtLink :to="item.href" class="ml-2 hover:text-primary transition-colors">
            {{ item.name }}
          </NuxtLink>
        </div>
      </li>
    </ol>

    <!-- МОБИЛЬНАЯ ВЕРСИЯ -->
    <div v-else class="flex items-center space-x-2 text-sm">
      <!-- Главная -->
      <NuxtLink to="/" class="text-muted-foreground hover:text-primary transition-colors flex-shrink-0">
        Главная
      </NuxtLink>

      <!-- Разделитель -->
      <ChevronRight class="h-4 w-4 text-muted-foreground flex-shrink-0" />

      <!-- Кнопка "..." с выпадающим меню (если есть промежуточные элементы) -->
      <template v-if="dropdownItems.length > 0">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="icon" class="h-8 w-8 rounded-full flex-shrink-0">
              <MoreHorizontal class="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Промежуточные разделы</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem v-for="item in dropdownItems" :key="item.id" as-child>
              <NuxtLink :to="item.href">
                {{ item.name }}
              </NuxtLink>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <!-- Разделитель -->
        <ChevronRight class="h-4 w-4 text-muted-foreground flex-shrink-0" />
      </template>

      <!-- Категория товара (а не само название товара) - кликабельная -->
      <NuxtLink v-if="categoryItem" :to="categoryItem.href" class="font-medium text-foreground truncate hover:text-primary transition-colors">
        {{ categoryItem.name }}
      </NuxtLink>
    </div>
  </nav>
</template>
