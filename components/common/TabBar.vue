<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle
} from '@/components/ui/navigation-menu'
import { Search, Clock, TrendingUp, Star } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'

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

// Данные для поиска
const searchSuggestions = [
  { title: 'Популярные запросы', icon: TrendingUp, items: ['футболки', 'джинсы', 'кроссовки', 'куртки'] },
  { title: 'Недавние поиски', icon: Clock, items: ['платья', 'шорты', 'рюкзаки'] },
  { title: 'Рекомендуемые категории', icon: Star, items: ['Спортивная одежда', 'Школьная форма', 'Праздничные наряды'] },
]

// Ref для хранения значения активного пункта меню
const activeMenuValue = ref<string | undefined>()

// Вычисляемое свойство для определения, должен ли overlay быть видимым
const isOverlayVisible = computed(() => !!activeMenuValue.value)

// Функция для закрытия меню и overlay
const closeMenu = () => {
  activeMenuValue.value = undefined
}
</script>

<template>
  <div class="flex">
    <!-- Растягиваем NavigationMenu на всю ширину контейнера -->
    <NavigationMenu v-model="activeMenuValue" class="relative z-[50] w-full max-w-full">
      <!-- Добавляем flex и justify-between для растягивания элементов -->
      <NavigationMenuList class="flex w-full items-center space-x-1">
        
        <!-- Поиск как элемент NavigationMenu -->
        <NavigationMenuItem value="search" class="flex-1">
          <NavigationMenuTrigger class="w-full justify-start bg-background border border-input hover:bg-accent hover:text-accent-foreground p-0 h-10">
            <div class="relative w-full items-center flex">
              <span class="absolute start-0 inset-y-0 flex items-center justify-center px-3">
                <Search class="size-4 text-muted-foreground" />
              </span>
              <span class="pl-10 pr-4 text-sm text-muted-foreground w-full text-left">
                Поиск товаров...
              </span>
            </div>
          </NavigationMenuTrigger>
          <NavigationMenuContent>
            <div class="min-w-screen p-4">
              <!-- Поле ввода в выпадающем меню -->
              <div class="relative mb-4 w-1/2">
                <Input 
                  id="search-input" 
                  type="text" 
                  placeholder="Введите запрос для поиска..." 
                  class="pl-10" 
                  autofocus
                />
                <span class="absolute start-0 inset-y-0 flex items-center justify-center px-3">
                  <Search class="size-4 text-muted-foreground" />
                </span>
              </div>
              
              <!-- Секции с предложениями -->
              <div class="space-y-4">
                <div v-for="section in searchSuggestions" :key="section.title">
                  <div class="flex items-center gap-2 mb-2">
                    <component :is="section.icon" class="size-4 text-muted-foreground" />
                    <h4 class="text-sm font-medium">{{ section.title }}</h4>
                  </div>
                  <div class="grid grid-cols-2 gap-2">
                    <div v-for="item in section.items" :key="item" 
                         class="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer">
                      {{ item }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <!-- Остальные пункты меню -->
        <NavigationMenuItem value="stocks">
          <NavigationMenuTrigger>
            <nuxt-link to="/stocks">Акции</nuxt-link>
          </NavigationMenuTrigger>
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

        <NavigationMenuItem value="boys">
          <NavigationMenuTrigger>Мальчикам</NavigationMenuTrigger>
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

        <NavigationMenuItem value="girls">
          <NavigationMenuTrigger>Девочкам</NavigationMenuTrigger>
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

        <NavigationMenuItem value="kiddy">
          <NavigationMenuTrigger>Малышам</NavigationMenuTrigger>
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

        <NavigationMenuItem value="holydays">
          <NavigationMenuTrigger>Отдых</NavigationMenuTrigger>
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
      </NavigationMenuList>
    </NavigationMenu>

    <!-- Overlay -->
    <div
      v-if="isOverlayVisible"
      class="fixed inset-0 bg-black/50 z-[40] transition-opacity duration-200"
      @click="closeMenu" 
    />
  </div>
</template>