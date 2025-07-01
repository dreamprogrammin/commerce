<script setup lang="ts">
import { ref, onMounted } from "vue";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { ChevronDown, Search } from "lucide-vue-next";
import { useTopMenuItemsStore } from "~/stores/menuItems/useTopMenuItems";
import { useSupabaseStorage } from "~/composables/menuItems/useSupabaseStorage";
import { staticMainMenuItems } from "~/config/staticItems";
import { BUCKET_NAME } from "~/constants";

const searchSuggestions = [
  {
    title: "Популярные запросы",
    items: ["футболки", "джинсы", "кроссовки", "куртки"],
  },
  {
    title: "Недавние поиски",
    items: ["платья", "шорты", "рюкзаки"],
  },
  {
    title: "Рекомендуемые категории",
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

const menuItemsStore = useTopMenuItemsStore();

const { getPublicUrl } = useSupabaseStorage();

onMounted(async () => {
  await menuItemsStore.fetchItems();
  console.log(menuItemsStore.items.length);
});

const menuStore = useTopMenuItemsStore();
onMounted(() => {
  menuStore.fetchItems();
});
</script>

<template>
  <div class="flex w-full items-center">
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
      <PopoverContent class="p-4 min-w-screen rounded-b-md">
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

    <NavigationMenu
      v-model="activeMenuValue"
      class="static flex-1"
      :delay-duration="100"
    >
      <NavigationMenuList
        class="flex w-full items-center justify-start space-x-1"
      >
        <template
          v-for="staticItem in staticMainMenuItems"
          :key="staticItem.slug"
        >
          <NavigationMenuItem :value="staticItem.slug">
            <!-- Если это триггер -->
            <template v-if="staticItem.isTrigger">
              <NuxtLink v-if="staticItem.href" :to="staticItem.href" as-child>
                <NavigationMenuTrigger :class="navigationMenuTriggerStyle()">
                  <Icon
                    v-if="staticItem.iconName"
                    :name="staticItem.iconName"
                    class="mr-1.5 h-4 w-4"
                  />
                  {{ staticItem.title }}
                  <ChevronDown
                    class="relative top-[1px] ml-1 h-3 w-3 transition duration-200 group-data-[state=open]:rotate-180"
                    aria-hidden="true"
                  />
                </NavigationMenuTrigger>
              </NuxtLink>
              <NavigationMenuTrigger
                v-else
                :class="navigationMenuTriggerStyle()"
                >{{ staticItem.title }}</NavigationMenuTrigger
              >

              <NavigationMenuContent>
                <div class="p-4 md:w-[500px] lg:w-[600px]">
                  <ul class="grid grid-cols-2 gap-4">
                    <li
                      v-for="child in menuStore.getChildren(staticItem.slug)"
                      :key="child.slug"
                    >
                      <NuxtLink
                        :to="child.href"
                        class="block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        @click="activeMenuValue = undefined"
                      >
                        <img
                          v-if="child.image_url"
                          :src="
                            getPublicUrl(BUCKET_NAME, child.image_url) ||
                            undefined
                          "
                          :alt="child.title"
                          class="mb-2 h-24 w-full object-cover rounded-md"
                        />
                        <div class="text-sm font-semibold leading-none">
                          {{ child.title }}
                        </div>
                        <p
                          v-if="child.description"
                          class="text-xs line-clamp-2 leading-snug text-muted-foreground"
                        >
                          {{ child.description }}
                        </p>
                      </NuxtLink>
                    </li>
                  </ul>
                  <div
                    v-if="
                      !menuStore.isLoading &&
                      menuStore.getChildren(staticItem.slug).length === 0
                    "
                    class="py-10 text-center text-sm text-muted-foreground"
                  >
                    Скоро здесь появятся подкатегории...
                  </div>
                </div>
              </NavigationMenuContent>
            </template>

            <!-- Если это просто статическая ссылка -->
            <NuxtLink
              v-else
              :to="staticItem.href!"
              :class="navigationMenuTriggerStyle()"
            >
              <Icon
                v-if="staticItem.iconName"
                :name="staticItem.iconName"
                class="mr-1.5 h-4 w-4"
              />
              {{ staticItem.title }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
