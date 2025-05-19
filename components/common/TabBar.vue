<script setup lang="ts">
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
} from "@/components/ui/navigation-menu"; // Уточните путь или используйте автоимпорт Nuxt

import ListItem from "./ListItem.vue"; // Импортируем созданный ListItem

// Ваши категории (оставил как есть)
const categories = [
  // ... (ваш массив categories) ...
  {
    id: "sales",
    title: "Акции",
    content: [
      { name: "Скидки до 50%", href: "/sales/discounts" },
      { name: "Сезонная распродажа", href: "/sales/seasonal" },
    ],
  },
  {
    id: "new",
    title: "Новинки",
    content: [
      { name: "Поступления недели", href: "/new/weekly" },
      { name: "Новые коллекции", href: "/new/collections" },
    ],
  },
  {
    id: "boys",
    title: "Мальчикам",
    content: [
      { name: "Верхняя одежда", href: "/boys/outerwear" },
      { name: "Футболки и топы", href: "/boys/tops" },
    ],
  },
  {
    id: "girls",
    title: "Девочкам",
    content: [
      { name: "Верхняя одежда", href: "/boys/outerwear" },
      { name: "Футболки и топы", href: "/boys/tops" },
    ],
  },
  {
    id: "holidays",
    title: "Сезон отдыха",
    content: [
      { name: "Верхняя одежда", href: "/boys/outerwear" },
      { name: "Футболки и топы", href: "/boys/tops" },
    ],
  },
];
</script>
<template>
  <div
    class="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background shadow-lg"
  >
    <NavigationMenu
      orientation="horizontal"
      class="mx-auto flex h-16 w-full max-w-full items-center"
    >
      <NavigationMenuList
        class="group flex flex-1 list-none items-center justify-around space-x-1 px-2"
      >
        <NavigationMenuItem
          v-for="category in categories"
          :key="category.id"
          class="flex-shrink-0"
        >
          <NavigationMenuTrigger
            class="group inline-flex h-14 w-max items-center justify-center rounded-md bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground focus:outline-none data-[state=open]:bg-accent/50 disabled:pointer-events-none disabled:opacity-50"
          >
            {{ category.title }}
            <!-- Можно добавить иконку ChevronDown/Up, если хотите -->
          </NavigationMenuTrigger>
          <NavigationMenuContent
            class="fixed bottom-[4.5rem] left-0 right-0 z-[60] mx-auto w-[calc(100vw-2rem)] max-w-md origin-bottom animate-in slide-in-from-bottom-5 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom-5 md:max-w-lg"
          >
            <!--
                Атрибуты для Radix Primitive (если shadcn-vue их пробрасывает):
                :side-offset="8"
                side="top"
                align="center"
              -->
            <ul
              class="grid w-full gap-3 rounded-lg border bg-popover p-4 text-popover-foreground shadow-lg md:grid-cols-2"
            >
              <ListItem
                v-for="item in category.content"
                :key="item.name"
                :title="item.name"
                :href="item.href"
              />
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>

      <!--
          Viewport должен быть позиционирован относительно корневого NavigationMenu.
          Его задача - плавно анимировать изменение размера контента.
          Для открытия вверх его тоже нужно адаптировать.
        -->
      <div class="perspect mb-2 flex justify-center">
        <NavigationMenuViewport
          class="fixed bottom-[4.5rem] z-[70] mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full origin-bottom overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 md:w-[var(--radix-navigation-menu-viewport-width)]"
        />
      </div>
    </NavigationMenu>
  </div>
</template>
