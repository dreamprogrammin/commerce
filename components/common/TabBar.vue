<script setup lang="ts">
import { ref, computed, watch } from "vue";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";

import { Search, Clock, TrendingUp, Star } from "lucide-vue-next";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useMenuItems } from "~/stores/menuItems/useMenuItems";
import { useSupabaseStorage } from "~/composables/menuItems/useSupabaseStorage";

interface StaticMainMenuItem {
  value: string; // Уникальный идентификатор, будет использоваться как parent_slug для дочерних из БД
  title: string;
  href?: string; // Ссылка, если сам пункт кликабельный
  isTrigger: boolean; // true, если открывает выпадающий список
  iconName?: string; // Опционально, имя иконки (например, 'Users' для "Мальчикам")
}

const staticMainMenuItems: StaticMainMenuItem[] = [
  { value: "stocks", title: "Акции", href: "/stocks", isTrigger: false },
  { value: "new-items", title: "Новинки", href: "/new", isTrigger: false },
  {
    value: "boys",
    title: "Мальчикам",
    href: "/catalog/boys",
    isTrigger: true,
    iconName: "lucide:user",
  }, // slug 'boys' будет parent_slug для его детей
  {
    value: "girls",
    title: "Девочкам",
    href: "/catalog/girls",
    isTrigger: true,
    iconName: "lucide:female",
  }, // slug 'girls'
  {
    value: "kiddy",
    title: "Малышам",
    href: "/catalog/kiddy",
    isTrigger: true,
    iconName: "lucide:baby",
  }, // slug 'kiddy'
  {
    value: "games",
    title: "Игры",
    href: "/catalog/games",
    isTrigger: true,
    iconName: "lucide:gamepad-2",
  }, // slug 'games'
  {
    value: "holidays",
    title: "Отдых",
    href: "/catalog/holidays",
    isTrigger: true,
    iconName: "lucide:sun",
  }, // slug 'holidays'
  // Добавьте сюда "Развивашки", если он тоже статический
  // { value: 'razvivashki', title: 'Развивашки', href: '/catalog/razvivashki', isTrigger: true, iconName: 'lucide:brain' },
];

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

const menuItemsStore = useMenuItems();

const { getPublicUrl } = useSupabaseStorage();

onMounted(async () => {
  await menuItemsStore.fetchItems();
  console.log(menuItemsStore.menuItems.length);
});
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

    <!-- NavigationMenu для остальных пунктов (работает по наведению)
    <NavigationMenu
      v-model="activeMenuValue"
      class="static"
      :delay-duration="100"
    >
      <!-- <NavigationMenuList class="flex w-full items-center space-x-1">
        <NavigationMenuItem value="stocks">
          <nuxt-link to="/stocks" :class="navigationMenuTriggerStyle()"
            >Акции</nuxt-link
          >
        </NavigationMenuItem>

        <NavigationMenuItem value="new-items">
          <nuxt-link to="/new" :class="navigationMenuTriggerStyle()"
            >Новинки</nuxt-link
          >
        </NavigationMenuItem>

        <NavigationMenuItem value="boys">
          <NavigationMenuTrigger>Мальчикам</NavigationMenuTrigger>
          <NavigationMenuContent>
            <div class="min-w-screen">
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
    </NavigationMenu> -->
    <!-- NavigationMenu теперь итерируется по staticMainMenuItems -->
    <NavigationMenu
      v-if="staticMainMenuItems.length > 0"
      v-model="activeMenuValue"
      class="static flex-1"
      :delay-duration="100"
    >
      <NavigationMenuList
        class="flex w-full items-center justify-start space-x-1"
      >
        <!-- justify-start для выравнивания по левому краю -->
        <!-- Итерация по статическим пунктам меню первого уровня -->
        <template
          v-for="staticItem in staticMainMenuItems"
          :key="staticItem.value"
        >
          <NavigationMenuItem :value="staticItem.value">
            <!-- 1. Если статический пункт - это просто ссылка (isTrigger: false) -->
            <NuxtLink
              v-if="!staticItem.isTrigger && staticItem.href"
              :to="staticItem.href"
              :class="navigationMenuTriggerStyle()"
            >
              {{ staticItem.title }}
            </NuxtLink>

            <!-- 2. Если статический пункт - это триггер (isTrigger: true) -->
            <template v-else-if="staticItem.isTrigger">
              <!-- Вариант А: Триггер является и ссылкой -->
              <NuxtLink v-if="staticItem.href" :to="staticItem.href" as-child>
                <NavigationMenuTrigger :class="navigationMenuTriggerStyle()">
                  <Icon
                    v-if="staticItem.iconName"
                    :name="staticItem.iconName"
                    class="mr-1 h-4 w-4 inline-block align-middle"
                  />
                  {{ staticItem.title }}
                </NavigationMenuTrigger>
              </NuxtLink>
              <!-- Вариант Б: Триггер не является ссылкой (только открывает подменю) -->
              <NavigationMenuTrigger
                v-else
                :class="navigationMenuTriggerStyle()"
              >
                <Icon
                  v-if="staticItem.iconName"
                  :name="staticItem.iconName"
                  class="mr-1 h-4 w-4 inline-block align-middle"
                />
                {{ staticItem.title }}
              </NavigationMenuTrigger>

              <!-- Содержимое выпадающего списка для этого статического триггера -->
              <NavigationMenuContent>
                <div
                  class="app-container w-full p-2 md:p-4 md:w-auto"
                  style="min-width: 300px; max-width: 650px"
                >
                  <!-- Проверяем, есть ли ДИНАМИЧЕСКИЕ дочерние элементы для этого СТАТИЧЕСКОГО родителя -->
                  <div
                    v-if="
                      menuItemsStore.isLoading &&
                      menuItemsStore.getChildren(staticItem.value).length === 0
                    "
                    class="py-10 text-center text-muted-foreground"
                  >
                    Загрузка подменю...
                  </div>
                  <div
                    v-else-if="
                      menuItemsStore.getChildren(staticItem.value).length > 0
                    "
                  >
                    <ul class="list-none space-y-1">
                      <!-- Итерируемся по элементам 2-го уровня (дети staticItem из БД) -->
                      <li
                        v-for="(childL1, indexL1) in menuItemsStore.getChildren(
                          staticItem.value,
                        )"
                        :key="childL1.slug"
                        class="group/l1"
                      >
                        <NuxtLink
                          :to="childL1.href || '#'"
                          :class="[
                            'block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
                            indexL1 === 0
                              ? 'font-semibold text-foreground hover:bg-accent hover:text-accent-foreground'
                              : 'font-normal text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground',
                            indexL1 === 0 ? 'mb-1' : '',
                          ]"
                          @click="activeMenuValue = undefined"
                        >
                          <div :class="indexL1 === 0 ? 'ml-[1.5rem]' : 'ml-0'">
                            <div
                              v-if="childL1.image_url"
                              class="mb-2 overflow-hidden rounded"
                            ></div>
                            <div class="leading-tight">{{ childL1.title }}</div>
                            <p
                              v-if="childL1.description"
                              :class="[
                                'text-xs line-clamp-2 leading-snug',
                                indexL1 === 0
                                  ? 'text-muted-foreground/90'
                                  : 'text-muted-foreground/70',
                              ]"
                            >
                              {{ childL1.description }}
                            </p>
                          </div>
                        </NuxtLink>
                        <!-- Список для элементов 3-го уровня (дети childL1 из БД) -->
                        <ul
                          v-if="
                            (childL1.item_type === 'trigger' ||
                              childL1.item_type === 'trigger_and_link') &&
                            menuItemsStore.getChildren(childL1.slug).length > 0
                          "
                          :class="[
                            'list-none space-y-px',
                            indexL1 === 0 ? 'ml-[calc(1.5rem+1rem)]' : 'ml-4',
                          ]"
                        >
                          <li
                            v-for="childL2 in menuItemsStore.getChildren(
                              childL1.slug,
                            )"
                            :key="childL2.slug"
                          >
                            <NuxtLink
                              :to="childL2.href || '#'"
                              class="block select-none rounded-md py-1.5 px-2 text-xs leading-snug no-underline outline-none transition-colors hover:bg-accent/50 hover:text-accent-foreground focus:bg-accent/50 focus:text-accent-foreground text-muted-foreground"
                              @click="activeMenuValue = undefined"
                            >
                              <div class="leading-tight">
                                {{ childL2.title }}
                              </div>
                            </NuxtLink>
                          </li>
                        </ul>
                      </li>
                    </ul>
                  </div>
                  <div
                    v-else-if="!menuItemsStore.isLoading"
                    class="py-10 text-center text-muted-foreground"
                  >
                    Нет подкатегорий для "{{ staticItem.title }}".
                  </div>
                </div>
              </NavigationMenuContent>
            </template>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
