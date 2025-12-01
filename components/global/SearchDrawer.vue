<script setup lang="ts">
import { nextTick, watch } from 'vue'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  'update:isOpen': [value: boolean]
}>()

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

const searchInput = ref<HTMLInputElement | null>(null)

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      searchInput.value?.focus()
    })
  }
  else {
    searchQuery.value = ''
    searchResults.value = []
  }
})

// Живой поиск при вводе
watch(searchQuery, (newQuery) => {
  if (newQuery.trim().length >= 2) {
    debouncedSearch(newQuery)
  }
  else {
    searchResults.value = []
  }
})

function close() {
  emit('update:isOpen', false)
}

function handleSearch() {
  performSearch()
  close()
}

function handleSelectSuggestion(suggestion: string) {
  selectSuggestion(suggestion)
  close()
}

function handleProductClick(slug: string) {
  navigateTo(`catalog/product/${slug}`)
  close()
}

function handleRemoveHistory(text: string, event: Event) {
  event.stopPropagation()
  removeHistoryItem(text)
}

function formatPrice(price: number, discount?: number): { original: string, final: string, hasDiscount: boolean } {
  const original = price.toLocaleString('ru-RU')
  const hasDiscount = !!discount && discount > 0
  const final = hasDiscount
    ? (price * (1 - discount / 100)).toLocaleString('ru-RU')
    : original

  return { original, final, hasDiscount }
}
</script>

<template>
  <Sheet :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <SheetContent
      side="top"
      class="h-[100dvh] p-0 flex flex-col border-0 bg-white"
    >
      <!-- Header -->
      <div class="flex-shrink-0 p-4 bg-white border-b sticky top-0 z-10">
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            class="rounded-full h-10 w-10 shrink-0 hover:bg-gray-100 transition-colors"
            @click="close"
          >
            <Icon name="lucide:arrow-left" class="w-5 h-5" />
          </Button>

          <div class="flex-1 relative">
            <Icon
              name="lucide:search"
              class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-500/60 pointer-events-none z-10"
            />
            <Input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              placeholder="Поиск игрушек..."
              class="h-11 pl-11 pr-4 text-base bg-blue-500/5 border-blue-500/20 focus-visible:bg-blue-500/10 focus-visible:border-blue-500/30 focus-visible:ring-blue-500/20 rounded-xl transition-colors"
              @keydown.enter="handleSearch"
              @keydown.esc="close"
            />

            <!-- Кнопка очистки -->
            <button
              v-if="hasQuery"
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
              @click="searchQuery = ''"
            >
              <Icon name="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto bg-gray-50/50">
        <!-- Индикатор загрузки -->
        <div v-if="isSearching" class="p-8 flex justify-center">
          <div class="flex items-center gap-3 text-blue-500">
            <Icon name="lucide:loader-2" class="w-5 h-5 animate-spin" />
            <span class="text-sm font-medium">Поиск...</span>
          </div>
        </div>

        <!-- Результаты поиска -->
        <div v-else-if="hasResults || brandSuggestions.length > 0" class="p-4 space-y-4">
          <!-- Бренды -->
          <div v-if="brandSuggestions.length > 0" class="mb-4">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 mb-2">
              Бренды
            </h3>
            <div class="space-y-1">
              <NuxtLink
                v-for="brand in brandSuggestions"
                :key="brand.id"
                :to="`/catalog/all?brand=${brand.slug}`"
                class="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl hover:shadow-md transition-all border border-blue-100"
                @click="close"
              >
                <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <Icon name="lucide:tag" class="w-5 h-5 text-blue-600" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-gray-900">
                    {{ brand.name }}
                  </p>
                  <p class="text-xs text-gray-500">
                    Все товары бренда
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="w-5 h-5 text-gray-400" />
              </NuxtLink>
            </div>
          </div>

          <!-- Товары -->
          <div v-if="hasResults">
            <div class="flex items-center justify-between px-2 mb-3">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Товары · {{ searchResults.length }}
              </h3>
              <button
                type="button"
                class="text-sm text-blue-600 hover:text-blue-700 font-medium"
                @click="handleSearch"
              >
                Показать все
              </button>
            </div>

            <button
              v-for="product in searchResults"
              :key="product.id"
              type="button"
              class="w-full flex items-center gap-4 p-3 bg-white rounded-xl hover:shadow-md transition-all duration-200 text-left border border-transparent hover:border-blue-100"
              @click="handleProductClick(product.slug)"
            >
              <!-- Изображение товара -->
              <div class="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                <NuxtImg
                  v-if="product.product_images[0]?.image_url"
                  :src="product.product_images[0].image_url"
                  :alt="product.name"
                  :placeholder="product.product_images[0].blur_placeholder || undefined"
                  class="w-full h-full object-cover"
                  loading="lazy"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Icon name="lucide:package" class="w-6 h-6 text-gray-300" />
                </div>
              </div>

              <!-- Информация о товаре -->
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-medium text-gray-900 line-clamp-1 mb-1">
                  {{ product.name }}
                </h4>

                <div class="flex items-center gap-2">
                  <span
                    class="text-base font-bold"
                    :class="formatPrice(product.price, product.discount_percentage).hasDiscount ? 'text-red-600' : 'text-gray-900'"
                  >
                    {{ formatPrice(product.price, product.discount_percentage).final }} ₸
                  </span>

                  <span
                    v-if="formatPrice(product.price, product.discount_percentage).hasDiscount"
                    class="text-xs text-gray-400 line-through"
                  >
                    {{ formatPrice(product.price, product.discount_percentage).original }} ₸
                  </span>

                  <span
                    v-if="formatPrice(product.price, product.discount_percentage).hasDiscount"
                    class="text-xs font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded"
                  >
                    -{{ product.discount_percentage }}%
                  </span>
                </div>

                <p v-if="product.brands" class="text-xs text-gray-500 mt-0.5">
                  {{ product.brands.name }}
                </p>
              </div>

              <!-- Статус наличия -->
              <div class="shrink-0">
                <div
                  v-if="product.stock_quantity > 0"
                  class="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full"
                >
                  <Icon name="lucide:check-circle" class="w-3 h-3" />
                  <span class="font-medium">В наличии</span>
                </div>
                <div
                  v-else
                  class="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full"
                >
                  Нет в наличии
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- Нет результатов -->
        <div v-else-if="hasQuery && !isSearching" class="p-8 text-center">
          <Icon name="lucide:search-x" class="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h3 class="text-lg font-semibold text-gray-700 mb-2">
            Ничего не найдено
          </h3>
          <p class="text-sm text-gray-500 mb-4">
            Попробуйте изменить поисковый запрос
          </p>
          <Button
            variant="outline"
            size="sm"
            @click="searchQuery = ''"
          >
            Очистить поиск
          </Button>
        </div>

        <!-- Подсказки и история -->
        <div v-else class="p-3">
          <div v-if="suggestions.length > 0" class="mb-6">
            <div class="flex items-center justify-between px-2 mb-3">
              <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {{ hasQuery ? 'Из истории' : 'Недавние запросы' }}
              </h3>
              <button
                v-if="suggestions.some(s => s.type === 'history')"
                type="button"
                class="text-xs text-blue-600 hover:text-blue-700 font-medium"
                @click="clearSearchHistory"
              >
                Очистить
              </button>
            </div>

            <div class="space-y-1">
              <button
                v-for="(item, index) in suggestions"
                :key="index"
                type="button"
                class="w-full flex items-center gap-4 px-4 py-3.5 text-base rounded-xl hover:bg-blue-50/80 active:bg-blue-100/80 transition-all duration-200 text-left group"
                @click="handleSelectSuggestion(item.text)"
              >
                <div
                  class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
                  :class="item.type === 'history' ? 'bg-gray-100 group-hover:bg-blue-100/80' : 'bg-blue-50/80 group-hover:bg-blue-100/80'"
                >
                  <Icon
                    :name="item.type === 'history' ? 'lucide:history' : 'lucide:trending-up'"
                    class="w-5 h-5 transition-colors"
                    :class="item.type === 'history' ? 'text-gray-600 group-hover:text-blue-600' : 'text-blue-500'"
                  />
                </div>
                <span class="flex-1 truncate text-gray-700 group-hover:text-gray-900 font-medium">
                  {{ item.text }}
                </span>
                <button
                  v-if="item.type === 'history'"
                  type="button"
                  class="w-6 h-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all"
                  @click="handleRemoveHistory(item.text, $event)"
                >
                  <Icon name="lucide:x" class="w-4 h-4 text-gray-400 hover:text-red-600" />
                </button>
                <Icon
                  v-else
                  name="lucide:arrow-up-left"
                  class="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </button>
            </div>
          </div>

          <!-- Популярные категории -->
          <div class="px-2">
            <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Популярные категории
            </h3>
            <div class="grid grid-cols-2 gap-2">
              <NuxtLink
                to="/catalog/konstruktory"
                class="flex items-center gap-2 p-3 bg-white rounded-lg hover:shadow-md transition-all border border-gray-100"
                @click="close"
              >
                <Icon name="lucide:blocks" class="w-5 h-5 text-blue-500" />
                <span class="text-sm font-medium text-gray-700">Конструкторы</span>
              </NuxtLink>
              <NuxtLink
                to="/catalog/myagkie-igrushki"
                class="flex items-center gap-2 p-3 bg-white rounded-lg hover:shadow-md transition-all border border-gray-100"
                @click="close"
              >
                <Icon name="lucide:heart" class="w-5 h-5 text-pink-500" />
                <span class="text-sm font-medium text-gray-700">Мягкие игрушки</span>
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
