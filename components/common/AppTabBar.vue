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
          class="group flex-1 w-full justify-start bg-transparent hover:bg-gray-50/50 dark:hover:bg-gray-800/30 p-0 h-11 rounded-2xl px-5 relative transition-all duration-500 ease-out border border-transparent hover:border-gray-200/50 dark:hover:border-gray-700/50"
        >
          <div class="relative w-full items-center flex">
            <span class="absolute start-0 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-[18px] text-gray-400 dark:text-gray-500 transition-all duration-500 group-hover:text-gray-600 dark:group-hover:text-gray-400 group-hover:scale-110" />
            </span>
            <span class="pl-9 pr-4 text-[13px] text-gray-400 dark:text-gray-500 w-full text-left font-normal tracking-wide group-hover:text-gray-600 dark:group-hover:text-gray-400 transition-colors duration-500">
              Поиск товаров
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent class="p-0 min-w-screen rounded-3xl border border-gray-100 dark:border-gray-800/50 shadow-2xl shadow-gray-900/5 dark:shadow-black/20 overflow-hidden bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl">
        <div :class="`w-full ${containerClass}`">
          <div class="relative mb-6 p-6 sm:p-8 pb-0">
            <Input
              id="search-input"
              type="text"
              placeholder="Что ищете?"
              class="pl-12 h-14 text-base rounded-2xl border-0 bg-gray-50/80 dark:bg-gray-800/50 focus:bg-white dark:focus:bg-gray-800 focus:ring-2 focus:ring-gray-900/5 dark:focus:ring-white/10 transition-all duration-300 placeholder:text-gray-400 dark:placeholder:text-gray-500"
              autofocus
            />
            <span class="absolute start-6 sm:start-8 top-6 sm:top-8 inset-y-0 flex items-center justify-center px-2">
              <Search class="size-5 text-gray-400 dark:text-gray-500" />
            </span>
          </div>

          <div class="space-y-8 px-6 sm:px-8 pb-6 sm:pb-8">
            <div v-for="section in searchSuggestions" :key="section.title">
              <h4 class="text-[11px] uppercase tracking-widest font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {{ section.title }}
              </h4>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="item in section.items"
                  :key="item"
                  class="inline-flex select-none rounded-full px-4 py-2 text-[13px] font-medium leading-none no-underline outline-none transition-all duration-300 cursor-pointer bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200/50 dark:hover:border-gray-700/50"
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
                  :class="`${navigationMenuTriggerStyle()} font-medium text-[13px] tracking-wide hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all duration-500 rounded-2xl text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200/30 dark:hover:border-gray-700/30 px-4`"
                >
                  {{ rootItem.name }}
                </NavigationMenuTrigger>
              </NuxtLink>

              <NavigationMenuContent>
                <div class="p-8 sm:p-10 md:p-12 min-w-screen bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl">
                  <ul class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
                    <li
                      v-for="childItem in rootItem.children"
                      :key="childItem.id"
                      class="space-y-3"
                    >
                      <NuxtLink
                        :to="childItem.href"
                        class="group block select-none rounded-3xl p-4 leading-none no-underline outline-none transition-all duration-500 hover:shadow-xl hover:shadow-gray-900/5 dark:hover:shadow-black/20 border border-transparent hover:border-gray-200/40 dark:hover:border-gray-700/40 bg-transparent hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                        @click="activeMenuValue = undefined"
                      >
                        <div
                          v-if="childItem.image_url"
                          class="mb-4 overflow-hidden rounded-2xl border border-gray-100/50 dark:border-gray-800/50"
                        >
                          <img
                            :src="getCategoryImageUrl(childItem.image_url) || undefined"
                            :alt="childItem.name"
                            loading="lazy"
                            class="h-32 sm:h-36 md:h-40 w-full object-cover transition-all duration-700 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                          >
                        </div>
                        <div
                          class="text-[15px] font-semibold leading-tight text-gray-800 dark:text-gray-200 mb-2 group-hover:text-gray-900 dark:group-hover:text-white transition-colors duration-500"
                        >
                          {{ childItem.name }}
                        </div>
                        <p
                          v-if="childItem.description"
                          class="text-[12px] line-clamp-2 leading-relaxed text-gray-500 dark:text-gray-400 group-hover:text-gray-600 dark:group-hover:text-gray-300 transition-colors duration-500"
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
                            class="block select-none rounded-xl py-2 px-3 text-[13px] leading-snug no-underline outline-none transition-all duration-300 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100/50 dark:hover:bg-gray-800/30 font-normal"
                            @click="activeMenuValue = undefined"
                          >
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
                    class="py-20 text-center text-[13px] text-gray-400 dark:text-gray-500 font-normal tracking-wide"
                  >
                    Скоро здесь появятся подкатегории
                  </div>
                  <div
                    v-if="categoriesStore.isLoading"
                    class="py-20 text-center text-[13px] text-gray-400 dark:text-gray-500 font-normal tracking-wide flex items-center justify-center gap-3"
                  >
                    <div class="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 dark:border-gray-600 border-t-gray-900 dark:border-t-white" />
                    Загрузка
                  </div>
                </div>
              </NavigationMenuContent>
            </template>
            <NuxtLink
              v-else
              :to="rootItem.href"
              :class="`${navigationMenuTriggerStyle()} font-medium text-[13px] tracking-wide hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all duration-500 rounded-2xl text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-transparent hover:border-gray-200/30 dark:hover:border-gray-700/30 px-4`"
            >
              {{ rootItem.name }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
