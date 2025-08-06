<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { staticMainMenuItems } from '@/config/staticItems'
import { BUCKET_NAME } from '@/constants'
import { useMenuAdminStore } from '@/stores/menuItems/useTopMenuItems'

const searchSuggestions = [
  {
    title: 'Популярные запросы',
    items: ['футболки', 'джинсы', 'кроссовки', 'куртки'],
  },
  {
    title: 'Недавние поиски',
    items: ['платья', 'шорты', 'рюкзаки'],
  },
  {
    title: 'Рекомендуемые категории',
    items: ['Спортивная одежда', 'Школьная форма', 'Праздничные наряды'],
  },
]

const headerOverlay = inject('headerOverlay') as
  | {
    showOverlay: () => void
    hideOverlay: () => void
    isVisible: Readonly<Ref<boolean>>
  }
  | undefined

const activeMenuValue = ref<string | undefined>()

const isSearchOpen = ref(false)

const isAnyPopupOpenInTabBar = computed(
  () => !!activeMenuValue.value || isSearchOpen.value,
)
watch(isAnyPopupOpenInTabBar, (isOpen) => {
  if (isOpen) {
    headerOverlay?.showOverlay()
  }
  else {
    setTimeout(() => {
      if (!activeMenuValue.value && !isSearchOpen.value) {
        headerOverlay?.hideOverlay()
      }
    }, 50)
  }
})

watch(activeMenuValue, (newValue) => {
  if (newValue !== undefined && isSearchOpen.value) {
    isSearchOpen.value = false
  }
})
watch(isSearchOpen, (isOpen) => {
  if (isOpen !== undefined && activeMenuValue.value) {
    activeMenuValue.value = undefined
  }
})
onUnmounted(() => {
  if (isAnyPopupOpenInTabBar.value) {
    headerOverlay?.hideOverlay()
  }
})

function closeAllPopups() {
  activeMenuValue.value = undefined
  isSearchOpen.value = false
}

defineExpose({ closeAllPopups })

const menuItemsStore = useMenuAdminStore()

const { getPublicUrl } = useSupabaseStorage()

onMounted(async () => {
  await menuItemsStore.fetchItems()
  console.log(menuItemsStore.items.length)
})

const menuStore = useMenuAdminStore()
onMounted(() => {
  menuStore.fetchItems()
})
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
                <h4 class="text-sm font-medium">
                  {{ section.title }}
                </h4>
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
      <NavigationMenuList class="flex w-full items-center justify-start gap-1">
        <template v-for="itemL1 in staticMainMenuItems" :key="itemL1.slug">
          <NavigationMenuItem :value="itemL1.slug">
            <template v-if="itemL1.isTrigger">
              <NuxtLink :to="itemL1.href" as-child>
                <NavigationMenuTrigger
                  :class="`${navigationMenuTriggerStyle()}`"
                >
                  {{ itemL1.title }}
                </NavigationMenuTrigger>
              </NuxtLink>

              <NavigationMenuContent>
                <div class="p-4 min-w-screen">
                  <ul class="grid grid-cols-4 gap-x-6 gap-y-4">
                    <li
                      v-for="itemL2 in menuStore.getChildren(itemL1.slug)"
                      :key="itemL2.slug"
                      class="space-y-1"
                    >
                      <NuxtLink
                        :to="itemL2.href"
                        class="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        @click="activeMenuValue = undefined"
                      >
                        <div
                          v-if="itemL2.image_url"
                          class="mb-2 overflow-hidden rounded-md"
                        >
                          <img
                            :src="
                              getPublicUrl(BUCKET_NAME, itemL2.image_url)
                                || undefined
                            "
                            :alt="itemL2.title"
                            class="h-24 w-full object-cover transition-transform duration-300 hover:scale-105"
                          >
                        </div>
                        <div
                          class="text-sm font-semibold leading-tight text-foreground"
                        >
                          {{ itemL2.title }}
                        </div>
                        <p
                          v-if="itemL2.description"
                          class="text-xs line-clamp-2 leading-snug text-muted-foreground"
                        >
                          {{ itemL2.description }}
                        </p>
                      </NuxtLink>
                      <ul
                        v-if="menuStore.getChildren(itemL2.slug).length > 0"
                        class="mt-2 ml-3 space-y-1 list-none"
                      >
                        <li
                          v-for="itemL3 in menuStore.getChildren(itemL2.slug)"
                          :key="itemL3.slug"
                        >
                          <NuxtLink
                            :to="itemL3.href"
                            class="block select-none rounded-md py-1.5 px-3 text-xs leading-snug no-underline outline-none transition-colors hover:bg-accent/50 focus:bg-accent/50 text-muted-foreground hover:text-foreground"
                            @click="activeMenuValue = undefined"
                          >
                            {{ itemL3.title }}
                          </NuxtLink>
                        </li>
                      </ul>
                    </li>
                  </ul>
                  <div
                    v-if="
                      menuStore.getChildren(itemL1.slug).length === 0
                        && !menuStore.isLoading
                    "
                    class="py-10 text-center text-sm text-muted-foreground"
                  >
                    Скоро здесь появятся подкатегории...
                  </div>
                  <div
                    v-if="menuStore.isLoading"
                    class="py-10 text-center text-sm text-muted-foreground"
                  >
                    Загрузка...
                  </div>
                </div>
              </NavigationMenuContent>
            </template>
            <NuxtLink
              v-else
              :to="itemL1.href"
              :class="navigationMenuTriggerStyle()"
            >
              {{ itemL1.title }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
