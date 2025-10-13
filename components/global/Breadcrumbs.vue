<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types'
import { useMediaQuery } from '@vueuse/core'
import { ChevronRight, MoreHorizontal } from 'lucide-vue-next'

const props = defineProps<{
  items: IBreadcrumbItem[]
}>()

const isDesktop = useMediaQuery('(min-width: 768px)')

// Все "крошки", включая "Главную" - для выпадающего меню
const fullPathItems = computed<IBreadcrumbItem[]>(() => {
  const homeCrumb: IBreadcrumbItem = { id: 'home', name: 'Главная', href: '/' }
  return [homeCrumb, ...props.items]
})

// Последний элемент - это ТЕКУЩАЯ КАТЕГОРИЯ (товар)
const currentCategory = computed(() => props.items[props.items.length - 1])
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
      <!-- Кнопка "..." с выпадающим меню -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="icon" class="h-8 w-8 rounded-full flex-shrink-0">
            <MoreHorizontal class="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuLabel>Полный путь</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <!-- Рендерим все элементы из fullPathItems -->
          <DropdownMenuItem v-for="item in fullPathItems" :key="item.id" as-child>
            <NuxtLink :to="item.href">
              {{ item.name }}
            </NuxtLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <!-- Разделитель -->
      <ChevronRight class="h-4 w-4 text-muted-foreground flex-shrink-0" />

      <!-- Категория товара (текущая страница) -->
      <span v-if="currentCategory" class="font-medium text-foreground truncate">
        {{ currentCategory.name }}
      </span>
    </div>
  </nav>
</template>
