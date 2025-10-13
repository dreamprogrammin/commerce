<script setup lang="ts">
import type { IBreadcrumbItem } from '@/types' // Импортируем тип для категорий
import { useMediaQuery } from '@vueuse/core'
import { ChevronRight } from 'lucide-vue-next'

// Компонент принимает массив `items`, каждый из которых имеет структуру CategoryRow
const props = defineProps<{
  items: IBreadcrumbItem[]
}>()
const isDesktop = useMediaQuery('(min-width: 768px)')

const currentPage = computed(() => props.items[props.items.length - 1])
// Предпоследний элемент - это родительская категория (например, "Ластики")
const parentPage = computed(() => props.items.length > 1 ? props.items[props.items.length - 2] : null)
// Все элементы, кроме последнего (для выпадающего меню)
const dropdownItems = computed(() => props.items.slice(0, -1))
</script>

<template>
  <nav v-if="items && items.length > 0" aria-label="Breadcrumb">
    <!-- ============== ДЕСКТОПНАЯ ВЕРСИЯ ============== -->
    <ol v-if="isDesktop" class="flex items-center space-x-2 text-sm text-muted-foreground">
      <li>
        <NuxtLink to="/" class="hover:text-primary transition-colors">
          Главная
        </NuxtLink>
      </li>
      <li v-for="(item, index) in items" :key="item.id">
        <div class="flex items-center">
          <ChevronRight class="h-4 w-4" />
          <span v-if="index === items.length - 1" class="ml-2 font-medium text-foreground" aria-current="page">
            {{ item.name }}
          </span>
          <NuxtLink v-else :to="item.href" class="ml-2 hover:text-primary transition-colors">
            {{ item.name }}
          </NuxtLink>
        </div>
      </li>
    </ol>

    <!-- ============== МОБИЛЬНАЯ ВЕРСИЯ ============== -->
    <div v-else class="flex items-center justify-between text-sm">
      <!-- Ссылка "Назад" на родительскую категорию -->
      <NuxtLink v-if="parentPage" :to="parentPage.href" class="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
        <ChevronLeft class="h-5 w-5" />
        <span class="font-medium">{{ parentPage.name }}</span>
      </NuxtLink>
      <!-- Если родителя нет, показываем ссылку на главную -->
      <NuxtLink v-else to="/" class="flex items-center gap-2 text-muted-foreground hover:text-primary transition-colors">
        <ChevronLeft class="h-5 w-5" />
        <span class="font-medium">Главная</span>
      </NuxtLink>

      <!-- Кнопка "три точки" с выпадающим меню -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" class="h-8 w-8">
            <MoreHorizontal class="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Полный путь</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem as-child>
            <NuxtLink to="/">
              <ChevronsRight class="mr-2 h-4 w-4" />
              <span>Главная</span>
            </NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem v-for="item in dropdownItems" :key="item.id" as-child>
            <NuxtLink :to="item.href">
              <ChevronsRight class="mr-2 h-4 w-4" />
              <span>{{ item.name }}</span>
            </NuxtLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </nav>
</template>
