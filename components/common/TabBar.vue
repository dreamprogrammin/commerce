<script setup lang="ts">
import { ref, computed } from 'vue' // Добавляем импорт ref и computed
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle
} from '@/components/ui/navigation-menu'

// Данные для компонентов
const components = [
  {
    title: 'Alert Dialog',
    href: '/docs/components/alert-dialog',
    description: 'A modal dialog that interrupts the user with important content and expects a response.',
  },
  {
    title: 'Hover Card',
    href: '/docs/components/hover-card',
    description: 'For sighted users to preview content available behind a link.',
  },
  {
    title: 'Progress',
    href: '/docs/components/progress',
    description: 'Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.',
  },
  {
    title: 'Scroll-area',
    href: '/docs/components/scroll-area',
    description: 'Visually or semantically separates content.',
  },
  {
    title: 'Tabs',
    href: '/docs/components/tabs',
    description: 'A set of layered sections of content—known as tab panels—that are displayed one at a time.',
  },
  {
    title: 'Tooltip',
    href: '/docs/components/tooltip',
    description: 'A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.',
  },
]

// Данные для раздела Акции
const stockItems = [
  { title: 'Сезонные скидки', href: '/stocks/seasonal', description: 'Лучшие предложения этого сезона.' },
  { title: 'Распродажа', href: '/stocks/sale', description: 'Товары со скидкой до 70%.' },
  { title: 'Акции дня', href: '/stocks/daily', description: 'Специальные предложения, действующие только сегодня.' },
]

// Данные для раздела Новинки
const newItems = [
  { title: 'Новые поступления', href: '/new/latest', description: 'Самые свежие товары в нашем каталоге.' },
  { title: 'Бестселлеры', href: '/new/bestsellers', description: 'Товары, пользующиеся наибольшим спросом.' },
  { title: 'Рекомендуемые', href: '/new/recommended', description: 'Рекомендации наших экспертов.' },
]

// --- Начало изменений ---
// Ref для хранения значения активного пункта меню (соответствует 'value' на NavigationMenuItem)
const activeMenuValue = ref<string | undefined>()

// Вычисляемое свойство для определения, должен ли overlay быть видимым
const isOverlayVisible = computed(() => !!activeMenuValue.value)

// Функция для закрытия меню и overlay (например, при клике на overlay)
const closeMenu = () => {
  activeMenuValue.value = undefined
}
// --- Конец изменений ---
</script>

<template>
  <div> <!-- Обертка, чтобы overlay был относительно чего-то, если нужно -->
    <!-- 
      Добавляем v-model="activeMenuValue"
      Добавляем `relative` и `z-index` для NavigationMenu, чтобы он был выше overlay.
      Компоненты NavigationMenuContent обычно имеют свой высокий z-index (например, 50)
    -->
    <NavigationMenu v-model="activeMenuValue" class="relative z-[50]">
      <NavigationMenuList>
        <!-- Пункт меню Акции с выпадающим подменю -->
        <!-- Добавляем `value` к NavigationMenuItem -->
        <NavigationMenuItem value="stocks">
          <NavigationMenuTrigger><nuxt-link to="/stocks">Акции</nuxt-link></NavigationMenuTrigger>
          <NavigationMenuContent>
            <div class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              <div v-for="item in stockItems" :key="item.title" class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                <nuxt-link :to="item.href" class="text-sm font-medium leading-none">{{ item.title }}</nuxt-link>
                <p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <!-- Пункт меню Новинки с выпадающим подменю -->
        <!-- Добавляем `value` к NavigationMenuItem -->
        <NavigationMenuItem value="new-items">
          <NavigationMenuTrigger>Новинки</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              <div v-for="item in newItems" :key="item.title" class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                <nuxt-link :to="item.href" class="text-sm font-medium leading-none">{{ item.title }}</nuxt-link>
                <p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <!-- Пункт меню Documentation с выпадающим подменю компонентов -->
        <!-- Добавляем `value` к NavigationMenuItem -->
        <NavigationMenuItem value="documentation">
          <NavigationMenuTrigger>Documentation</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
              <div v-for="component in components" :key="component.title" class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground">
                <nuxt-link :to="component.href" class="text-sm font-medium leading-none">{{ component.title }}</nuxt-link>
                <p class="line-clamp-2 text-sm leading-snug text-muted-foreground">
                  {{ component.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <!-- Простая ссылка без выпадающего меню -->
        <NavigationMenuItem>
          <NavigationMenuLink :class="navigationMenuTriggerStyle()" href="/about">
            О нас
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>

    <!-- --- Начало изменений: Overlay --- -->
    <div
      v-if="isOverlayVisible"
      class="fixed inset-0 bg-black/50 z-[40] transition-opacity duration-200"
      @click="closeMenu" 
    />
    <!-- --- Конец изменений: Overlay --- -->
  </div>
</template>