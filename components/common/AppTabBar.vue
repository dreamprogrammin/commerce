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
import { BUCKET_NAME_CATEGORY, BUCKET_NAME_PRODUCT } from '@/constants'
import { carouselContainerVariants } from '@/lib/variants'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { HeaderOverlayKey } from '@/types/app'

const headerOverlay = inject(HeaderOverlayKey)

const containerClass = carouselContainerVariants({ contained: 'always' })

const activeMenuValue = ref<string | undefined>()
const isSearchOpen = ref(false)

// Поиск товаров
const {
  searchQuery,
  searchResults,
  isSearching,
  suggestions,
  hasResults,
  hasQuery,
  brandSuggestions,
  debouncedSearch,
  performSearch,
  selectSuggestion,
  removeHistoryItem,
  clearSearchHistory,
} = useProductSearch()

const { getImageUrl: getSupabaseImageUrl, getVariantUrl }
  = useSupabaseStorage()

// Живой поиск при вводе
watch(searchQuery, (newQuery) => {
  if (newQuery.trim().length >= 4) {
    debouncedSearch(newQuery)
  }
  else {
    searchResults.value = []
  }
})

// Очистка при закрытии
watch(isSearchOpen, (isOpen) => {
  if (isOpen !== undefined && activeMenuValue.value) {
    activeMenuValue.value = undefined
  }
  if (!isOpen) {
    searchQuery.value = ''
    searchResults.value = []
  }
})

function handleSearch() {
  performSearch()
  isSearchOpen.value = false
}

function handleSelectSuggestion(suggestion: string) {
  selectSuggestion(suggestion)
  isSearchOpen.value = false
}

function handleRemoveHistory(text: string, event: Event) {
  event.stopPropagation()
  removeHistoryItem(text)
}

function getProductImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl)
    return null
  return getSupabaseImageUrl(BUCKET_NAME_PRODUCT, imageUrl, {
    width: IMAGE_SIZES.THUMBNAIL.width,
    height: IMAGE_SIZES.THUMBNAIL.height,
    quality: 80,
    format: 'webp',
    resize: 'cover',
  })
}

function formatPrice(
  price: number,
  discount?: number,
  finalPrice?: number,
): { original: string, final: string, hasDiscount: boolean } {
  const original = price.toLocaleString('ru-RU')
  const hasDiscount = !!discount && discount > 0
  // 🔥 Используем final_price из базы данных (с психологическим округлением)
  const final = finalPrice
    ? finalPrice.toLocaleString('ru-RU')
    : hasDiscount
      ? (price * (1 - discount / 100)).toLocaleString('ru-RU')
      : original

  return { original, final, hasDiscount }
}

const categoriesStore = useCategoriesStore()

const menuTree = computed(() => categoriesStore.menuTree)
const additionalMenuItems = computed(() => categoriesStore.additionalMenuItems)

useAsyncData('category-data', () => categoriesStore.fetchCategoryData())
useAsyncData('additional-menu-items', () =>
  categoriesStore.fetchAdditionalMenuItems())

// Загружаем бренды для меню после загрузки категорий (client-only)
watch(
  () => menuTree.value.length,
  (len) => {
    if (len > 0) {
      categoriesStore.loadBrandsForMenuCategories()
    }
  },
  { immediate: true },
)

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

// Закрываем поиск при открытии меню
watch(activeMenuValue, (newValue) => {
  if (newValue !== undefined && isSearchOpen.value) {
    isSearchOpen.value = false
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

function getCategoryImageUrl(imageUrl: string | null): string | null {
  if (!imageUrl)
    return null
  return getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'sm')
}

function getCategoryImageVariants(imageUrl: string | null) {
  if (!imageUrl) {
    return { sm: null, md: null, lg: null }
  }
  return {
    sm: getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'sm'),
    md: getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'md'),
    lg: getVariantUrl(BUCKET_NAME_CATEGORY, imageUrl, 'lg'),
  }
}

// Функция для закрытия меню после клика по ссылке
function handleLinkClick() {
  activeMenuValue.value = undefined
}

defineExpose({ closeAllPopups })
</script>

<template>
  <div class="flex w-full items-center gap-3">
    <!-- Поиск с Popover -->
    <Popover v-model:open="isSearchOpen">
      <PopoverTrigger as-child>
        <button
          class="group max-w-3xs shrink-0 w-full justify-start bg-white/15 hover:bg-white/20 transition-all duration-200 p-0 h-11 rounded-xl px-4 relative backdrop-blur-sm border border-white/10 hover:border-white/20 shadow-lg"
        >
          <div class="relative w-full items-center flex">
            <span
              class="absolute start-0 inset-y-0 flex items-center justify-center px-2"
            >
              <Icon
                name="lucide:search"
                class="size-4.5 text-white/80 transition-all duration-200 group-hover:text-white group-hover:scale-110"
              />
            </span>
            <span
              class="pl-8 pr-4 text-sm text-white/80 w-full text-left font-medium group-hover:text-white transition-colors duration-200"
            >
              Поиск товаров
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent
        class="p-0 min-w-screen rounded-2xl border border-border shadow-2xl overflow-hidden bg-popover"
        align="start"
      >
        <div :class="`w-full ${containerClass}`">
          <!-- Поле поиска -->
          <div class="relative p-6 pb-4 border-b border-border">
            <Input
              v-model="searchQuery"
              type="text"
              placeholder="Поиск игрушек..."
              class="pl-12 h-12 text-base rounded-xl border-2 bg-background focus:border-primary transition-all duration-200"
              autofocus
              @keydown.enter="handleSearch"
              @keydown.esc="isSearchOpen = false"
            />
            <span
              class="absolute start-6 top-6 inset-y-0 flex items-center justify-center px-2"
            >
              <Icon name="lucide:search" class="size-5 text-muted-foreground" />
            </span>

            <!-- Кнопка очистки -->
            <button
              v-if="hasQuery"
              type="button"
              class="absolute right-6 top-1/2 -translate-y-1/2 size-6 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-accent"
              @click="searchQuery = ''"
            >
              <Icon name="lucide:x" class="size-4" />
            </button>
          </div>

          <!-- Индикатор загрузки -->
          <div v-if="isSearching" class="p-8 flex justify-center">
            <div class="flex items-center gap-3 text-primary">
              <Icon name="lucide:loader-2" class="size-5 animate-spin" />
              <span class="text-sm font-medium">Поиск...</span>
            </div>
          </div>

          <!-- Результаты поиска -->
          <div
            v-else-if="hasResults || brandSuggestions.length > 0"
            class="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-4"
          >
            <!-- Бренды -->
            <div v-if="brandSuggestions.length > 0" class="flex flex-col gap-2">
              <h3
                class="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2"
              >
                Бренды
              </h3>
              <div class="grid grid-cols-2 gap-2">
                <NuxtLink
                  v-for="brand in brandSuggestions"
                  :key="brand.id"
                  :to="`/brand/${brand.slug}`"
                  class="flex items-center gap-3 px-3 py-2.5 bg-accent rounded-lg hover:shadow-md transition-all border border-border"
                  @click="isSearchOpen = false"
                >
                  <Icon
                    name="lucide:tag"
                    class="size-4 text-primary shrink-0"
                  />
                  <span class="text-sm font-medium text-foreground truncate">
                    {{ brand.name }}
                  </span>
                </NuxtLink>
              </div>
            </div>

            <!-- Товары -->
            <div v-if="hasResults" class="flex flex-col gap-2">
              <div class="flex items-center justify-between px-2">
                <h3
                  class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  Товары · {{ searchResults.length }}
                </h3>
                <button
                  type="button"
                  class="text-sm text-primary hover:text-primary/80 font-medium"
                  @click="handleSearch"
                >
                  Показать все
                </button>
              </div>

              <div class="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <NuxtLink
                  v-for="product in searchResults.slice(0, 6)"
                  :key="product.id"
                  :to="`/catalog/products/${product.slug}`"
                  class="group flex flex-col gap-2 p-3 bg-card rounded-xl hover:shadow-lg transition-all duration-200 border border-border hover:border-primary/40"
                  @click="isSearchOpen = false"
                >
                  <!-- Изображение товара -->
                  <div
                    class="aspect-square rounded-lg overflow-hidden bg-muted"
                  >
                    <ProgressiveImage
                      v-if="product.product_images[0]?.image_url"
                      :src="
                        getProductImageUrl(product.product_images[0].image_url)
                      "
                      :alt="product.name"
                      aspect-ratio="square"
                      object-fit="cover"
                      placeholder-type="lqip"
                      :blur-data-url="
                        product.product_images[0].blur_placeholder
                      "
                      :bucket-name="BUCKET_NAME_PRODUCT"
                      :file-path="product.product_images[0].image_url"
                      class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                      eager
                    />
                    <div
                      v-else
                      class="w-full h-full flex items-center justify-center"
                    >
                      <Icon
                        name="lucide:package"
                        class="size-8 text-muted-foreground/60"
                      />
                    </div>
                  </div>

                  <!-- Информация о товаре -->
                  <div class="flex-1 flex flex-col gap-1">
                    <h4
                      class="text-sm font-medium text-foreground line-clamp-2 leading-tight"
                    >
                      {{ product.name }}
                    </h4>

                    <div class="flex items-center gap-1.5 mt-auto">
                      <span
                        class="text-base font-bold"
                        :class="
                          formatPrice(
                            product.price,
                            product.discount_percentage,
                            product.final_price,
                          ).hasDiscount
                            ? 'text-destructive'
                            : 'text-foreground'
                        "
                      >
                        {{
                          formatPrice(
                            product.price,
                            product.discount_percentage,
                            product.final_price,
                          ).final
                        }}
                        ₸
                      </span>

                      <span
                        v-if="
                          formatPrice(
                            product.price,
                            product.discount_percentage,
                            product.final_price,
                          ).hasDiscount
                        "
                        class="text-xs text-muted-foreground line-through"
                      >
                        {{
                          formatPrice(
                            product.price,
                            product.discount_percentage,
                            product.final_price,
                          ).original
                        }}
                        ₸
                      </span>
                    </div>

                    <div
                      v-if="product.stock_quantity > 0"
                      class="flex items-center gap-1 text-xs text-green-600"
                    >
                      <Icon name="lucide:check-circle" class="size-3" />
                      <span>В наличии</span>
                    </div>
                    <div v-else class="text-xs text-muted-foreground">
                      Нет в наличии
                    </div>
                  </div>
                </NuxtLink>
              </div>
            </div>
          </div>

          <!-- Нет результатов -->
          <div v-else-if="hasQuery && !isSearching" class="p-8 text-center">
            <Icon
              name="lucide:search-x"
              class="size-16 mx-auto text-muted-foreground/50 mb-4"
            />
            <h3 class="text-lg font-semibold text-foreground mb-2">
              Ничего не найдено
            </h3>
            <p class="text-sm text-muted-foreground mb-4">
              Попробуйте изменить поисковый запрос
            </p>
            <Button variant="outline" size="sm" @click="searchQuery = ''">
              Очистить поиск
            </Button>
          </div>

          <!-- Подсказки и история -->
          <div v-else class="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-4">
            <div v-if="suggestions.length > 0">
              <div class="flex items-center justify-between px-2 mb-3">
                <h3
                  class="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                >
                  {{ hasQuery ? "Из истории" : "Недавние запросы" }}
                </h3>
                <button
                  v-if="suggestions.some((s) => s.type === 'history')"
                  type="button"
                  class="text-xs text-primary hover:text-primary/80 font-medium"
                  @click="clearSearchHistory"
                >
                  Очистить
                </button>
              </div>

              <div class="flex flex-col gap-1">
                <button
                  v-for="(item, index) in suggestions"
                  :key="index"
                  type="button"
                  class="w-full flex items-center gap-3 px-4 py-3 text-base rounded-lg hover:bg-accent active:bg-accent/80 transition-all duration-200 text-left group"
                  @click="handleSelectSuggestion(item.text)"
                >
                  <div
                    class="size-8 rounded-full flex items-center justify-center shrink-0 transition-colors"
                    :class="
                      item.type === 'history'
                        ? 'bg-muted group-hover:bg-accent'
                        : 'bg-accent group-hover:bg-accent/80'
                    "
                  >
                    <Icon
                      :name="
                        item.type === 'history'
                          ? 'lucide:history'
                          : 'lucide:trending-up'
                      "
                      class="size-4 transition-colors"
                      :class="
                        item.type === 'history'
                          ? 'text-muted-foreground group-hover:text-primary'
                          : 'text-primary'
                      "
                    />
                  </div>
                  <span
                    class="flex-1 truncate text-muted-foreground group-hover:text-foreground font-medium"
                  >
                    {{ item.text }}
                  </span>
                  <button
                    v-if="item.type === 'history'"
                    type="button"
                    class="size-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                    @click="handleRemoveHistory(item.text, $event)"
                  >
                    <Icon
                      name="lucide:x"
                      class="size-4 text-muted-foreground hover:text-destructive"
                    />
                  </button>
                </button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>

    <!-- Навигационное меню -->
    <NavigationMenu
      v-model="activeMenuValue"
      class="static flex-1"
      :delay-duration="150"
    >
      <NavigationMenuList class="flex w-full items-center justify-end gap-2">
        <!-- Дополнительные пункты меню: Новинки, Акции -->
        <template
          v-for="additionalItem in additionalMenuItems"
          :key="additionalItem.id"
        >
          <NavigationMenuItem :value="additionalItem.id">
            <NuxtLink
              :to="additionalItem.href"
              :class="`${navigationMenuTriggerStyle()} font-semibold text-sm bg-white/15 hover:bg-white/25 transition-all duration-200 rounded-xl text-white border border-white/10 hover:border-white/20 px-4 h-11 backdrop-blur-sm shadow-lg hover:shadow-xl flex items-center gap-2`"
            >
              <Icon
                v-if="additionalItem.icon"
                :name="additionalItem.icon"
                class="w-4 h-4"
              />
              {{ additionalItem.name }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>

        <!-- Основные категории -->
        <template v-for="rootItem in menuTree" :key="rootItem.id">
          <NavigationMenuItem :value="rootItem.slug">
            <template v-if="rootItem.children && rootItem.children.length > 0">
              <NuxtLink :to="rootItem.href" as-child>
                <NavigationMenuTrigger
                  :class="`${navigationMenuTriggerStyle()} font-semibold text-sm bg-white/15 hover:bg-white/25 transition-all duration-200 rounded-xl text-white border border-white/10 hover:border-white/20 px-4 h-11 backdrop-blur-sm shadow-lg hover:shadow-xl`"
                  @click="handleLinkClick"
                >
                  {{ rootItem.name }}
                </NavigationMenuTrigger>
              </NuxtLink>

              <NavigationMenuContent>
                <div
                  class="min-w-screen h-[45vh] bg-popover overflow-y-auto"
                >
                  <ul
                    :class="containerClass"
                    class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 py-12"
                  >
                    <li
                      v-for="childItem in rootItem.children"
                      :key="childItem.id"
                      class="flex flex-col gap-3"
                    >
                      <NuxtLink
                        :to="childItem.href"
                        class="group block select-none rounded-xl p-4 leading-none no-underline outline-none transition-all duration-200 hover:shadow-lg border border-border hover:border-primary/50 bg-popover hover:bg-accent"
                        @click="handleLinkClick"
                      >
                        <div
                          v-if="childItem.image_url"
                          class="mb-3 overflow-hidden bg-muted rounded-lg aspect-square w-16"
                        >
                          <ProgressiveImage
                            :src="getCategoryImageUrl(childItem.image_url)"
                            :src-sm="getCategoryImageVariants(childItem.image_url).sm"
                            :src-md="getCategoryImageVariants(childItem.image_url).md"
                            :src-lg="getCategoryImageVariants(childItem.image_url).lg"
                            :alt="childItem.name"
                            aspect-ratio="square"
                            object-fit="cover"
                            placeholder-type="shimmer"
                            :blur-data-url="childItem.blur_placeholder"
                            class="w-full h-full transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div
                          class="text-sm font-bold leading-tight text-foreground mb-1.5 group-hover:text-primary transition-colors"
                        >
                          {{ childItem.name }}
                        </div>
                      </NuxtLink>
                      <ul
                        v-if="
                          childItem.children && childItem.children.length > 0
                        "
                        class="ml-2 flex flex-col gap-1 list-none"
                      >
                        <li
                          v-for="grandChildItem in childItem.children"
                          :key="grandChildItem.id"
                        >
                          <NuxtLink
                            :to="grandChildItem.href"
                            class="block select-none py-1 px-3 text-sm leading-snug no-underline outline-none transition-colors duration-200 text-muted-foreground hover:text-foreground"
                            @click="handleLinkClick"
                          >
                            {{ grandChildItem.name }}
                          </NuxtLink>
                        </li>
                      </ul>

                      <!-- Бренды 3-го уровня -->
                      <div
                        v-if="
                          childItem.brandsLoaded
                            && childItem.brands
                            && childItem.brands.length > 0
                        "
                        class="ml-2 mt-1"
                      >
                        <div
                          v-if="
                            childItem.children && childItem.children.length > 0
                          "
                          class="border-t border-border my-1"
                        />
                        <ul class="flex flex-col gap-1 list-none">
                          <li v-for="brand in childItem.brands" :key="brand.id">
                            <NuxtLink
                              :to="`${childItem.href}?brand=${brand.slug}`"
                              class="block select-none py-1 px-3 text-sm leading-snug no-underline outline-none transition-colors duration-200 text-muted-foreground hover:text-foreground"
                              @click="handleLinkClick"
                            >
                              {{ rootItem.name }} {{ brand.name }}
                            </NuxtLink>
                          </li>
                        </ul>
                      </div>
                      <div
                        v-else-if="
                          categoriesStore.brandsLoading
                            && !childItem.brandsLoaded
                        "
                        class="ml-2 mt-2 flex flex-col gap-2 px-3"
                      >
                        <div
                          v-for="n in 3"
                          :key="n"
                          class="h-3 w-24 bg-muted rounded animate-pulse"
                        />
                      </div>
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
                      <div
                        class="size-16 bg-muted rounded-xl flex items-center justify-center"
                      >
                        <Icon
                          name="lucide:package-open"
                          class="size-8 text-muted-foreground"
                        />
                      </div>
                      <p
                        class="text-sm text-muted-foreground font-medium"
                      >
                        Скоро здесь появятся подкатегории
                      </p>
                    </div>
                  </div>
                  <div
                    v-if="categoriesStore.isLoading"
                    class="py-20 text-center"
                  >
                    <div
                      class="inline-flex items-center gap-3 text-sm text-muted-foreground font-medium"
                    >
                      <div
                        class="size-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary"
                      />
                      Загрузка категорий
                    </div>
                  </div>
                </div>
              </NavigationMenuContent>
            </template>
            <NuxtLink
              v-else
              :to="rootItem.href"
              :class="`${navigationMenuTriggerStyle()} font-semibold text-sm bg-white/15 hover:bg-white/25 transition-all duration-200 rounded-xl text-white border border-white/10 hover:border-white/20 px-5 h-11 backdrop-blur-sm shadow-lg hover:shadow-xl`"
            >
              {{ rootItem.name }}
            </NuxtLink>
          </NavigationMenuItem>
        </template>
      </NavigationMenuList>
    </NavigationMenu>
  </div>
</template>
