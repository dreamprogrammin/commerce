<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle
} from "@/components/ui/navigation-menu";

import { Search, Clock, TrendingUp, Star } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const components = [
  {
    title: "Alert Dialog",
    href: "/docs/components/alert-dialog",
    description:
      "A modal dialog that interrupts the user with important content and expects a response.",
  },
  {
    title: "Hover Card",
    href: "/docs/components/hover-card",
    description:
      "For sighted users to preview content available behind a link.",
  },
  {
    title: "Progress",
    href: "/docs/components/progress",
    description:
      "Displays an indicator showing the completion progress of a task, typically displayed as a progress bar.",
  },
  {
    title: "Scroll-area",
    href: "/docs/components/scroll-area",
    description: "Visually or semantically separates content.",
  },
  {
    title: "Tabs",
    href: "/docs/components/tabs",
    description:
      "A set of layered sections of content—known as tab panels—that are displayed one at a time.",
  },
  {
    title: "Tooltip",
    href: "/docs/components/tooltip",
    description:
      "A popup that displays information related to an element when the element receives keyboard focus or the mouse hovers over it.",
  },
];

const stockItems = [
  {
    title: "Сезонные скидки",
    href: "/stocks/seasonal",
    description: "Лучшие предложения этого сезона.",
  },
  {
    title: "Распродажа",
    href: "/stocks/sale",
    description: "Товары со скидкой до 70%.",
  },
  {
    title: "Акции дня",
    href: "/stocks/daily",
    description: "Специальные предложения, действующие только сегодня.",
  },
];

// Данные для раздела Новинки
const newItems = [
  {
    title: "Новые поступления",
    href: "/new/latest",
    description: "Самые свежие товары в нашем каталоге.",
  },
  {
    title: "Бестселлеры",
    href: "/new/bestsellers",
    description: "Товары, пользующиеся наибольшим спросом.",
  },
  {
    title: "Рекомендуемые",
    href: "/new/recommended",
    description: "Рекомендации наших экспертов.",
  },
];

// Данные для поиска
const searchSuggestions = [
  {
    title: "Популярные запросы",
    icon: TrendingUp,
    items: ["футболки", "джинсы", "кроссовки", "куртки"],
  },
  {
    title: "Недавние поиски",
    icon: Clock,
    items: ["платья", "шорты", "рюкзаки"],
  },
  {
    title: "Рекомендуемые категории",
    icon: Star,
    items: ["Спортивная одежда", "Школьная форма", "Праздничные наряды"],
  },
];

const headerOverlay = inject("headerOverlay") as
  | {
      showOverlay: () => void;
      hideOverlay: () => void;
      isVisible: Readonly<Ref<boolean>>;
    }
  | undefined;

const activeMenuValue = ref<string | undefined>();

const isSearchOpen = ref(false);

const isAnyPopupOpenInTabBar = computed(
  () => !!activeMenuValue.value || isSearchOpen.value,
);
watch(isAnyPopupOpenInTabBar, (isOpen) => {
  if (isOpen) {
    headerOverlay?.showOverlay();
  } else {
    setTimeout(() => {
      if (!activeMenuValue.value && !isSearchOpen.value) {
        headerOverlay?.hideOverlay();
      }
    }, 50);
  }
});

watch(activeMenuValue, (newValue) => {
  if (newValue !== undefined && isSearchOpen.value) {
    isSearchOpen.value = false;
  }
});
watch(isSearchOpen, (isOpen) => {
  if (isOpen !== undefined && activeMenuValue.value) {
    activeMenuValue.value = undefined;
  }
});
onUnmounted(() => {
  if (isAnyPopupOpenInTabBar.value) {
    headerOverlay?.hideOverlay();
  }
});

const closeAllPopups = () => {
  activeMenuValue.value = undefined;
  isSearchOpen.value = false;
};

defineExpose({ closeAllPopups });
</script>

<template>
  <div class="flex">
    <!-- Отдельный компонент для поиска (PopOver) -->
    <!-- z-index для поиска должен быть выше, чем у оверлея, но равен z-index NavigationMenu -->
    <Popover v-model:open="isSearchOpen">
      <PopoverTrigger as-child>
        <button
          class="flex-1 w-full justify-start bg-background border border-input hover:bg-accent hover:text-accent-foreground p-0 h-10 rounded-md px-4 relative mr-1"
        >
          <div class="relative w-full items-center flex">
            <span
              class="absolute start-0 inset-y-0 flex items-center justify-center px-3"
            >
              <Search class="size-4 text-muted-foreground" />
            </span>
            <span
              class="pl-10 pr-4 text-sm text-muted-foreground w-full text-left"
            >
              Поиск товаров...
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <!-- ИСПРАВЛЕНО: УБРАНЫ absolute left-0 w-full И min-w-screen -->
      <!-- PopoverContent сам позиционируется. Задайте нужную ширину через w-[...] -->
      <PopoverContent class="p-4 min-w-screen rounded-b-md">
        <!-- Пример ширины, можно настроить -->
        <!-- Поле ввода в выпадающем меню -->
        <div class="w-full app-container">
          <div class="relative mb-4">
            <Input
              id="search-input"
              type="text"
              placeholder="Введите запрос для поиска..."
              class="pl-10"
              autofocus
            />
            <span
              class="absolute start-0 inset-y-0 flex items-center justify-center px-3"
            >
              <Search class="size-4 text-muted-foreground" />
            </span>
          </div>

          <!-- Секции с предложениями -->
          <div class="space-y-4">
            <div v-for="section in searchSuggestions" :key="section.title">
              <div class="flex items-center gap-2 mb-2">
                <component
                  :is="section.icon"
                  class="size-4 text-muted-foreground"
                />
                <h4 class="text-sm font-medium">{{ section.title }}</h4>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div
                  v-for="item in section.items"
                  :key="item"
                  class="block select-none rounded-md p-2 text-sm leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground cursor-pointer"
                >
                  {{ item }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- NavigationMenu для остальных пунктов (работает по наведению) -->
    <NavigationMenu
      v-model="activeMenuValue"
      class="static"
      :delay-duration="100"
    >
      <NavigationMenuList class="flex w-full items-center space-x-1">
        <!-- Остальные пункты меню -->
        <NavigationMenuItem value="stocks">
            <nuxt-link to="/stocks" :class="navigationMenuTriggerStyle()">Акции</nuxt-link>
        </NavigationMenuItem>

        <NavigationMenuItem value="new-items">
        <nuxt-link to="/new" :class="navigationMenuTriggerStyle()">Новинки</nuxt-link>
        </NavigationMenuItem>

        <NavigationMenuItem value="boys">
          <NavigationMenuTrigger>Мальчикам</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div
              class="min-w-screen"
            >
            <div class="w-full app-container grid gap-3 md:grid-cols-2">
              <div
                v-for="component in components"
                :key="component.title"
                class="block select-none space-y-1 rounded-md py-4 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <nuxt-link
                  :to="component.href"
                  class="text-sm font-medium leading-none"
                  >{{ component.title }}</nuxt-link
                >
                <p
                  class="line-clamp-2 text-sm leading-snug text-muted-foreground"
                >
                  {{ component.description }}
                </p>
              </div>
            </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="girls">
          <NavigationMenuTrigger>Девочкам</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div
              class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]"
            >
              <div
                v-for="component in components"
                :key="component.title"
                class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <nuxt-link
                  :to="component.href"
                  class="text-sm font-medium leading-none"
                  >{{ component.title }}</nuxt-link
                >
                <p
                  class="line-clamp-2 text-sm leading-snug text-muted-foreground"
                >
                  {{ component.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="kiddy">
          <NavigationMenuTrigger>Малышам</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div
              class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]"
            >
              <div
                v-for="component in components"
                :key="component.title"
                class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <nuxt-link
                  :to="component.href"
                  class="text-sm font-medium leading-none"
                  >{{ component.title }}</nuxt-link
                >
                <p
                  class="line-clamp-2 text-sm leading-snug text-muted-foreground"
                >
                  {{ component.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="holydays">
          <NavigationMenuTrigger>Игры</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div
              class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]"
            >
              <div
                v-for="component in components"
                :key="component.title"
                class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <nuxt-link
                  :to="component.href"
                  class="text-sm font-medium leading-none"
                  >{{ component.title }}</nuxt-link
                >
                <p
                  class="line-clamp-2 text-sm leading-snug text-muted-foreground"
                >
                  {{ component.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="holydays">
          <NavigationMenuTrigger>Отдых</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div
              class="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]"
            >
              <div
                v-for="component in components"
                :key="component.title"
                class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <nuxt-link
                  :to="component.href"
                  class="text-sm font-medium leading-none"
                  >{{ component.title }}</nuxt-link
                >
                <p
                  class="line-clamp-2 text-sm leading-snug text-muted-foreground"
                >
                  {{ component.description }}
                </p>
              </div>
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
