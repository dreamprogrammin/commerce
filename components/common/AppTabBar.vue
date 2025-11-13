<script setup lang="ts">
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_CATEGORY } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { HeaderOverlayKey } from '@/types/app'

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

const headerOverlay = inject(HeaderOverlayKey)

const containerClass = carouselContainerVariants({ contained: 'always' })

const activeMenuValue = ref<string | undefined>()
const isSearchOpen = ref(false)

const categoriesStore = useCategoriesStore()
const { getImageUrl } = useSupabaseStorage()

const menuTree = computed(() => categoriesStore.menuTree)

useAsyncData('category-data', () => categoriesStore.fetchCategoryData())

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

function getCategoryImageUrl(imageUrl: string | null) {
  return getImageUrl(BUCKET_NAME_CATEGORY, imageUrl, IMAGE_SIZES.CATEGORY_MENU)
}
defineExpose({ closeAllPopups })
</script>

<template>
  <div class="flex w-full items-center gap-3">
    <Popover v-model:open="isSearchOpen">
      <PopoverTrigger as-child>
        <button
          class="group flex-1 w-full justify-start bg-white dark:bg-gray-900 hover:bg-white dark:hover:bg-gray-800 p-0 h-11 rounded-xl px-5 relative transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20"
        >
          <div class="relative w-full items-center flex">
            <span class="absolute start-0 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-[18px] text-gray-500 dark:text-gray-400 transition-all duration-300 group-hover:text-blue-500 dark:group-hover:text-blue-400 group-hover:scale-110" />
            </span>
            <span class="pl-9 pr-4 text-[13px] text-gray-600 dark:text-gray-400 w-full text-left font-medium group-hover:text-gray-900 dark:group-hover:text-white transition-colors duration-300">
              Поиск товаров
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent class="p-0 min-w-screen rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl shadow-gray-900/10 dark:shadow-black/30 overflow-hidden bg-white dark:bg-gray-900">
        <div :class="`w-full ${containerClass}`">
          <div class="relative mb-6 p-6 sm:p-8 pb-0">
            <Input
              id="search-input"
              type="text"
              placeholder="Что ищете?"
              class="pl-12 h-14 text-base rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 dark:focus:border-blue-500 transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              autofocus
            />
            <span class="absolute start-6 sm:start-8 top-6 sm:top-8 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-5 text-gray-400 dark:text-gray-500" />
            </span>
          </div>

          <div class="space-y-8 px-6 sm:px-8 pb-6 sm:pb-8">
            <div v-for="section in searchSuggestions" :key="section.title">
              <h4 class="text-[11px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400 mb-3 flex items-center gap-2">
                <div class="w-1 h-4 bg-blue-500 rounded-full" />
                {{ section.title }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="item in section.items"
                  :key="item"
                  class="inline-flex select-none rounded-lg px-4 py-2 text-[13px] font-medium leading-none no-underline outline-none transition-all duration-300 cursor-pointer bg-gray-50 dark:bg-gray-800 hover:bg-blue-500 dark:hover:bg-blue-600 text-gray-700 dark:text-gray-300 hover:text-white border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 hover:shadow-lg hover:shadow-blue-500/20 active:scale-95"
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
      :delay-duration="150"
    >
      <NavigationMenuList class="flex w-full items-center justify-start gap-1">
        <template v-for="rootItem in menuTree" :key="rootItem.id">
          <NavigationMenuItem :value="rootItem.slug">
            <template v-if="rootItem.children && rootItem.children.length > 0">
              <NuxtLink :to="rootItem.href" as-child>
                <NavigationMenuTrigger
                  :class="`${navigationMenuTriggerStyle()} font-bold text-[13px] bg-white dark:bg-gray-900 hover:bg-blue-500 dark:hover:bg-blue-600 transition-all duration-300 rounded-xl text-gray-700 dark:text-gray-300 hover:text-white dark:hover:text-white border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 px-4 hover:shadow-lg hover:shadow-blue-500/20`"
                >
                  {{ rootItem.name }}
                </NavigationMenuTrigger>
              </NuxtLink>

              <NavigationMenuContent>
                <div class="p-8 sm:p-10 md:p-12 min-w-screen bg-white dark:bg-gray-900 border-t-2 border-blue-500/20">
                  <ul class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                    <li
                      v-for="childItem in rootItem.children"
                      :key="childItem.id"
                      class="space-y-3"
                    >
                      <NuxtLink
                        :to="childItem.href"
                        class="group block select-none rounded-2xl p-4 leading-none no-underline outline-none transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/20 dark:hover:shadow-black/30 border-2 border-gray-200 dark:border-gray-800 hover:border-blue-500 dark:hover:border-blue-500 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800"
                        @click="activeMenuValue = undefined"
                      >
                        <div
                          v-if="childItem.image_url"
                          class="mb-4 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 group-hover:border-blue-500/30"
                        >
                          <img
                            :src="getCategoryImageUrl(childItem.image_url) || undefined"
                            :alt="childItem.name"
                            loading="lazy"
                            class="h-32 sm:h-36 md:h-40 w-full object-cover transition-all duration-700 group-hover:scale-110"
                          >
                        </div>
                        <div
                          class="text-[15px] font-bold leading-tight text-gray-800 dark:text-gray-200 mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300 flex items-center gap-2"
                        >
                          {{ childItem.name }}
                          <Icon name="lucide:arrow-right" class="w-0 h-4 opacity-0 group-hover:w-4 group-hover:opacity-100 transition-all duration-300 text-blue-500" />
                        </div>
                        <p
                          v-if="childItem.description"
                          class="text-[12px] line-clamp-2 leading-relaxed text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors duration-300"
                        >
                          {{ childItem.description }}
                        </p>
                      </NuxtLink>
                      <ul
                        v-if="childItem.children && childItem.children.length > 0"
                        class="mt-2 ml-1 space-y-0.5 list-none"
                      >
                        <li
                          v-for="grandChildItem in childItem.children"
                          :key="grandChildItem.id"
                        >
                          <NuxtLink
                            :to="grandChildItem.href"
                            class="group/sub flex items-center gap-2 select-none rounded-lg py-2 px-3 text-[13px] leading-snug no-underline outline-none transition-all duration-300 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-medium border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                            @click="activeMenuValue = undefined"
                          >
                            <Icon name="lucide:circle" class="w-1.5 h-1.5 text-gray-400 group-hover/sub:text-blue-500 transition-colors" />
                            {{ grandChildItem.name }}
                          </NuxtLink>
                        </li>
                      </ul>
                    </li>
                  </ul>
                  <div
                    v-if="
                      rootItem.children.length === 0
                        && !categoriesStore.isLoading
                    "
                    class="py-20 text-center"
                  >
                    <div class="inline-flex flex-col items-center gap-3">
                      <div class="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-2xl flex items-center justify-center">
                        <Icon name="lucide:package-open" class="w-8 h-8 text-gray-400" />
                      </div>
                      <p class="text-[13px] text-gray-500 dark:text-gray-400 font-medium">
                        Скоро здесь появятся подкатегории
                      </p>
                    </div>
                  </div>
                  <div
                    v-if="categoriesStore.isLoading"
                    class="py-20 text-center"
                  >
                    <div class="inline-flex items-center gap-3 text-[13px] text-gray-500 dark:text-gray-400 font-medium">
                      <div class="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
                      Загрузка категорий
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </template>
            <NuxtLink
              v-else
              :to="rootItem.href"
              :class="`${navigationMenuTriggerStyle()} font-bold text-[13px] bg-white dark:bg-gray-900 hover:bg-blue-500 dark:hover:bg-blue-600 transition-all duration-300 rounded-xl text-gray-700 dark:text-gray-300 hover:text-white dark:hover:text-white border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-600 px-4 hover:shadow-lg hover:shadow-blue-500/20`"
            >
              {{ rootItem.name }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
