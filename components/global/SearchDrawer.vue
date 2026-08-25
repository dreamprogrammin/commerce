<script setup lang="ts">
import { nextTick, watch } from 'vue'
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

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

const { getImageUrl: getSupabaseImageUrl } = useSupabaseStorage()

interface ComponentWithEl {
  $el: HTMLInputElement
}
const searchInput = ref<ComponentWithEl | null>(null)

watch(() => props.isOpen, (isOpen) => {
  if (isOpen) {
    nextTick(() => {
      searchInput.value?.$el?.focus()
    })
  }
  else {
    searchQuery.value = ''
    searchResults.value = []
  }
})
// Живой поиск при вводе
watch(searchQuery, (newQuery) => {
  if (newQuery.trim().length >= 4) {
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

function formatPrice(price: number, discount?: number): { original: string, final: string, hasDiscount: boolean } {
  const original = price.toLocaleString('ru-RU')
  const hasDiscount = !!discount && discount > 0
  const final = hasDiscount
    ? (price * (1 - discount / 100)).toLocaleString('ru-RU')
    : original

  return { original, final, hasDiscount }
}

function handleRemoveHistory(text: string, event: Event) {
  event.stopPropagation()
  removeHistoryItem(text)
}

/**
 * Получить оптимизированный URL изображения
 */
function getImageUrl(imageUrl: string | null): string | null {
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
</script>

<template>
  <Sheet :open="isOpen" @update:open="emit('update:isOpen', $event)">
    <SheetContent
      side="top"
      class="h-[100dvh] p-0 flex flex-col border-0 bg-background"
    >
      <!-- Header -->
      <div class="flex-shrink-0 p-4 bg-background border-b sticky top-0 z-10">
        <div class="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            class="rounded-full size-10 shrink-0 hover:bg-accent transition-colors"
            @click="close"
          >
            <Icon name="lucide:arrow-left" class="size-5" />
          </Button>

          <div class="flex-1 relative">
            <Icon
              name="lucide:search"
              class="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-primary/60 pointer-events-none z-10"
            />
            <Input
              ref="searchInput"
              v-model="searchQuery"
              type="search"
              placeholder="Поиск игрушек..."
              class="h-11 pl-11 pr-4 text-base bg-primary/5 border-primary/20 focus-visible:bg-primary/10 focus-visible:border-primary/30 focus-visible:ring-primary/20 rounded-xl transition-colors"
              @keydown.enter="handleSearch"
              @keydown.esc="close"
            />

            <!-- Кнопка очистки -->
            <button
              v-if="hasQuery"
              type="button"
              class="absolute right-3 top-1/2 -translate-y-1/2 size-5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              @click="searchQuery = ''"
            >
              <Icon name="lucide:x" class="size-4" />
            </button>
          </div>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto bg-muted/50">
        <!-- Индикатор загрузки -->
        <div v-if="isSearching" class="p-8 flex justify-center">
          <div class="flex items-center gap-3 text-primary">
            <Icon name="lucide:loader-2" class="size-5 animate-spin" />
            <span class="text-sm font-medium">Поиск...</span>
          </div>
        </div>

        <!-- Результаты поиска -->
        <div v-else-if="hasResults || brandSuggestions.length > 0" class="p-4 flex flex-col gap-4">
          <!-- Бренды -->
          <div v-if="brandSuggestions.length > 0" class="mb-4">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 mb-2">
              Бренды
            </h3>
            <div class="flex flex-col gap-1">
              <NuxtLink
                v-for="brand in brandSuggestions"
                :key="brand.id"
                :to="`/brand/${brand.slug}`"
                class="flex items-center gap-3 px-4 py-3 bg-accent rounded-xl hover:shadow-md transition-all border border-border"
                @click="close"
              >
                <div class="size-10 rounded-full bg-background flex items-center justify-center shrink-0 shadow-sm">
                  <Icon name="lucide:tag" class="size-5 text-primary" />
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-semibold text-foreground">
                    {{ brand.name }}
                  </p>
                  <p class="text-xs text-muted-foreground">
                    Все товары бренда
                  </p>
                </div>
                <Icon name="lucide:chevron-right" class="size-5 text-muted-foreground" />
              </NuxtLink>
            </div>
          </div>

          <!-- Товары -->
          <div v-if="hasResults">
            <div class="flex items-center justify-between px-2 mb-3">
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
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

            <NuxtLink
              v-for="product in searchResults"
              :key="product.id"
              :to="`/catalog/products/${product.slug}`"
              class="w-full flex items-center gap-4 p-3 bg-card rounded-xl hover:shadow-md transition-all duration-200 text-left border border-transparent hover:border-primary/30"
              @click="close"
            >
              <!-- Изображение товара -->
              <div class="size-16 rounded-lg overflow-hidden shrink-0">
                <ProgressiveImage
                  v-if="product.product_images[0]?.image_url"
                  :src="getImageUrl(product.product_images[0].image_url)"
                  :alt="product.name"
                  aspect-ratio="square"
                  object-fit="cover"
                  placeholder-type="lqip"
                  :blur-data-url="product.product_images[0].blur_placeholder"
                  :bucket-name="BUCKET_NAME_PRODUCT"
                  :file-path="product.product_images[0].image_url"
                  eager
                />
                <div v-else class="w-full h-full flex items-center justify-center bg-muted">
                  <Icon name="lucide:package" class="size-6 text-muted-foreground/60" />
                </div>
              </div>

              <!-- Информация о товаре -->
              <div class="flex-1 min-w-0">
                <h4 class="text-sm font-medium text-foreground line-clamp-1 mb-1">
                  {{ product.name }}
                </h4>

                <div class="flex items-center gap-2">
                  <span
                    class="text-base font-bold"
                    :class="formatPrice(product.price, product.discount_percentage).hasDiscount ? 'text-destructive' : 'text-foreground'"
                  >
                    {{ formatPrice(product.price, product.discount_percentage).final }}&nbsp;₸
                  </span>

                  <span
                    v-if="formatPrice(product.price, product.discount_percentage).hasDiscount"
                    class="text-xs text-muted-foreground line-through"
                  >
                    {{ formatPrice(product.price, product.discount_percentage).original }}&nbsp;₸
                  </span>

                  <span
                    v-if="formatPrice(product.price, product.discount_percentage).hasDiscount"
                    class="text-xs font-semibold text-destructive bg-destructive/10 px-1.5 py-0.5 rounded"
                  >
                    -{{ product.discount_percentage }}%
                  </span>
                </div>

                <p v-if="product.brands" class="text-xs text-muted-foreground mt-0.5">
                  {{ product.brands.name }}
                </p>
              </div>

              <!-- Статус наличия -->
              <div class="shrink-0">
                <div
                  v-if="product.stock_quantity > 0"
                  class="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full"
                >
                  <Icon name="lucide:check-circle" class="size-3" />
                  <span class="font-medium">В наличии</span>
                </div>
                <div
                  v-else
                  class="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full"
                >
                  Нет в наличии
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>

        <!-- Нет результатов -->
        <div v-else-if="hasQuery && !isSearching" class="p-8 text-center">
          <Icon name="lucide:search-x" class="size-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 class="text-lg font-semibold text-foreground mb-2">
            Ничего не найдено
          </h3>
          <p class="text-sm text-muted-foreground mb-4">
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
              <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {{ hasQuery ? 'Из истории' : 'Недавние запросы' }}
              </h3>
              <button
                v-if="suggestions.some(s => s.type === 'history')"
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
                class="w-full flex items-center gap-4 px-4 py-3.5 text-base rounded-xl hover:bg-primary/10 active:bg-primary/15 transition-all duration-200 text-left group"
                @click="handleSelectSuggestion(item.text)"
              >
                <div
                  class="size-9 rounded-full flex items-center justify-center shrink-0 transition-colors"
                  :class="item.type === 'history' ? 'bg-muted group-hover:bg-primary/15' : 'bg-primary/10 group-hover:bg-primary/15'"
                >
                  <Icon
                    :name="item.type === 'history' ? 'lucide:history' : 'lucide:trending-up'"
                    class="size-5 transition-colors"
                    :class="item.type === 'history' ? 'text-muted-foreground group-hover:text-primary' : 'text-primary'"
                  />
                </div>
                <span class="flex-1 truncate text-muted-foreground group-hover:text-foreground font-medium">
                  {{ item.text }}
                </span>
                <button
                  v-if="item.type === 'history'"
                  type="button"
                  class="size-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                  @click="handleRemoveHistory(item.text, $event)"
                >
                  <Icon name="lucide:x" class="size-4 text-muted-foreground hover:text-destructive" />
                </button>
                <Icon
                  v-else
                  name="lucide:arrow-up-left"
                  class="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </SheetContent>
  </Sheet>
</template>
