<script setup lang="ts">
import { useSupabaseStorage } from '@/composables/menuItems/useSupabaseStorage'
import { IMAGE_SIZES } from '@/config/images'
import { BUCKET_NAME_PRODUCT } from '@/constants'

/**
 * Инлайн-строка поиска шапки (SiteHeader.dc.html — <form> поиска).
 *
 * Поле ввода видно всегда, живые результаты падают в выпадашку (Popover,
 * телепортируется в body — не обрезается `overflow:hidden` стеклянной шапки).
 * Логика поиска — общий композабл `useProductSearch`, поведение бэкенда то же.
 *
 * Доступность: паттерн combobox + listbox. Стрелками ↑/↓ ходим по опциям,
 * Enter выбирает подсвеченную (или отправляет сырой запрос), Esc закрывает.
 *
 * `dense` — компактный вид для мобильной плашки.
 * `showSubmitButton` — видимая кнопка «Найти» справа внутри поля (по
 * умолчанию нет: форма и так отправляется по Enter). Только для потребителей,
 * которым явно нужен CTA — сейчас это CategoryScrollBar.
 */
withDefaults(defineProps<{ dense?: boolean, showSubmitButton?: boolean }>(), {
  dense: false,
  showSubmitButton: false,
})

const LISTBOX_ID = useId()

const open = ref(false)
const activeIndex = ref(-1)

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
  clearSearchHistory,
  removeHistoryItem,
} = useProductSearch()

const { getImageUrl } = useSupabaseStorage()

// Живой поиск при вводе (порог как в AppTabBar — от 3 символов).
watch(searchQuery, (q) => {
  if (q.trim().length >= 3) {
    debouncedSearch(q)
  }
  else {
    // Чистим ОБА набора — иначе устаревшие чипы брендов держат ветку
    // результатов и прячут панель истории.
    searchResults.value = []
    brandSuggestions.value = []
  }
})

const brandOptions = computed(() =>
  brandSuggestions.value.map(b => ({ id: `${LISTBOX_ID}-b-${b.id}`, kind: 'brand' as const, to: `/brand/${b.slug}` })),
)
const productOptions = computed(() =>
  searchResults.value.slice(0, 6).map(p => ({ id: `${LISTBOX_ID}-p-${p.id}`, kind: 'product' as const, to: `/catalog/products/${p.slug}` })),
)
const suggestionOptions = computed(() =>
  suggestions.value.map((s, i) => ({ id: `${LISTBOX_ID}-s-${i}`, kind: 'suggestion' as const, text: s.text })),
)

// Плоский список опций в порядке отрисовки — модель навигации клавиатурой.
const navItems = computed(() => {
  if (isSearching.value)
    return []
  if (hasResults.value || brandSuggestions.value.length > 0)
    return [...brandOptions.value, ...productOptions.value]
  if (hasQuery.value)
    return []
  return suggestionOptions.value
})

const activeId = computed(() => navItems.value[activeIndex.value]?.id)

function isActive(id: string): boolean {
  return activeId.value === id
}

// Список опций сменился — снимаем подсветку.
watch(navItems, () => {
  activeIndex.value = -1
})

// Подсвеченную опцию держим в зоне видимости выпадашки.
watch(activeId, (id) => {
  if (!id)
    return
  nextTick(() => document.getElementById(id)?.scrollIntoView({ block: 'nearest' }))
})

function activateItem(item: (typeof navItems.value)[number]) {
  if (item.kind === 'suggestion') {
    pickSuggestion(item.text)
  }
  else {
    open.value = false
    navigateTo(item.to)
  }
}

function onKeydown(e: KeyboardEvent) {
  const items = navItems.value
  if (e.key === 'ArrowDown') {
    open.value = true
    if (items.length) {
      e.preventDefault()
      activeIndex.value = (activeIndex.value + 1) % items.length
    }
  }
  else if (e.key === 'ArrowUp') {
    if (items.length) {
      e.preventDefault()
      activeIndex.value = activeIndex.value <= 0 ? items.length - 1 : activeIndex.value - 1
    }
  }
  else if (e.key === 'Enter') {
    const item = items[activeIndex.value]
    if (item) {
      // Гасим неявную отправку формы — выбираем подсвеченную опцию.
      e.preventDefault()
      activateItem(item)
    }
    // Иначе форма отправится штатно → submitSearch (сырой запрос).
  }
  else if (e.key === 'Escape') {
    open.value = false
    activeIndex.value = -1
  }
}

function submitSearch() {
  if (!hasQuery.value)
    return
  performSearch()
  open.value = false
}

function pickSuggestion(text: string) {
  selectSuggestion(text)
  open.value = false
}

function showAll() {
  performSearch()
  open.value = false
}

function onRemoveHistory(text: string, event: Event) {
  event.stopPropagation()
  removeHistoryItem(text)
}

function productImageUrl(url: string | null | undefined): string | null {
  if (!url)
    return null
  return getImageUrl(BUCKET_NAME_PRODUCT, url, {
    width: IMAGE_SIZES.THUMBNAIL.width,
    height: IMAGE_SIZES.THUMBNAIL.height,
    quality: 80,
    format: 'webp',
    resize: 'cover',
  })
}

function formatPrice(price: number, discount?: number) {
  const original = price.toLocaleString('ru-RU')
  const hasDiscount = !!discount && discount > 0
  const final = hasDiscount
    ? Math.round(price * (1 - discount / 100)).toLocaleString('ru-RU')
    : original
  return { original, final, hasDiscount }
}
</script>

<template>
  <Popover v-model:open="open">
    <PopoverAnchor as-child>
      <form
        class="sh-search"
        :class="{ 'sh-search--dense': dense, 'sh-search--with-submit': showSubmitButton }"
        role="search"
        @submit.prevent="submitSearch"
      >
        <Icon name="lucide:search" class="sh-search__icon" />
        <input
          v-model="searchQuery"
          type="search"
          role="combobox"
          aria-autocomplete="list"
          :aria-expanded="open"
          :aria-controls="LISTBOX_ID"
          :aria-activedescendant="activeId || undefined"
          enterkeyhint="search"
          :placeholder="dense ? 'Поиск' : 'Найти игрушки, бренды, наборы…'"
          class="sh-search__input"
          aria-label="Поиск товаров"
          @focus="open = true"
          @keydown="onKeydown"
        >
        <button
          v-if="hasQuery"
          type="button"
          class="sh-search__clear"
          aria-label="Очистить"
          @click="searchQuery = ''"
        >
          <Icon name="lucide:x" class="size-4" />
        </button>
        <button
          v-if="showSubmitButton"
          type="submit"
          class="sh-search__submit"
        >
          Найти
        </button>
      </form>
    </PopoverAnchor>

    <PopoverContent
      align="start"
      :side-offset="10"
      class="w-[min(620px,92vw)] p-0 rounded-2xl overflow-hidden border border-border shadow-2xl"
      @open-auto-focus.prevent
      @close-auto-focus.prevent
    >
      <!-- Загрузка -->
      <div v-if="isSearching" class="p-8 flex justify-center">
        <div class="flex items-center gap-3 text-primary">
          <Icon name="lucide:loader-2" class="size-5 animate-spin" />
          <span class="text-sm font-medium">Поиск…</span>
        </div>
      </div>

      <!-- Результаты -->
      <div
        v-else-if="hasResults || brandSuggestions.length > 0"
        :id="LISTBOX_ID"
        role="listbox"
        aria-label="Результаты поиска"
        class="max-h-[60vh] overflow-y-auto p-4 flex flex-col gap-4"
      >
        <div v-if="brandSuggestions.length > 0" class="flex flex-col gap-2">
          <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-1">
            Бренды
          </h3>
          <div class="grid grid-cols-2 gap-2">
            <NuxtLink
              v-for="(brand, i) in brandSuggestions"
              :id="brandOptions[i]?.id"
              :key="brand.id"
              :to="`/brand/${brand.slug}`"
              role="option"
              :aria-selected="isActive(brandOptions[i]?.id ?? '')"
              class="flex items-center gap-3 px-3 py-2.5 bg-accent rounded-lg hover:shadow-md transition-all border border-border"
              :class="{ 'ring-2 ring-primary': isActive(brandOptions[i]?.id ?? '') }"
              @click="open = false"
            >
              <Icon name="lucide:tag" class="size-4 text-primary shrink-0" />
              <span class="text-sm font-medium text-foreground truncate">{{ brand.name }}</span>
            </NuxtLink>
          </div>
        </div>

        <div v-if="hasResults" class="flex flex-col gap-2">
          <div class="flex items-center justify-between px-1">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Товары · {{ searchResults.length }}
            </h3>
            <button
              type="button"
              class="text-sm text-primary hover:text-primary/80 font-medium"
              @click="showAll"
            >
              Показать все
            </button>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <NuxtLink
              v-for="(product, i) in searchResults.slice(0, 6)"
              :id="productOptions[i]?.id"
              :key="product.id"
              :to="`/catalog/products/${product.slug}`"
              role="option"
              :aria-selected="isActive(productOptions[i]?.id ?? '')"
              class="group flex flex-col gap-2 p-2.5 bg-card rounded-xl hover:shadow-lg transition-all border border-border hover:border-primary/40"
              :class="{ 'border-primary ring-2 ring-primary': isActive(productOptions[i]?.id ?? '') }"
              @click="open = false"
            >
              <div class="aspect-square rounded-lg overflow-hidden bg-muted">
                <ProgressiveImage
                  v-if="product.product_images[0]?.image_url"
                  :src="productImageUrl(product.product_images[0].image_url)"
                  :alt="product.name"
                  aspect-ratio="square"
                  object-fit="cover"
                  placeholder-type="lqip"
                  :blur-data-url="product.product_images[0].blur_placeholder"
                  :bucket-name="BUCKET_NAME_PRODUCT"
                  :file-path="product.product_images[0].image_url"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform"
                  eager
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <Icon name="lucide:package" class="size-8 text-muted-foreground/60" />
                </div>
              </div>
              <div class="flex-1 flex flex-col gap-1">
                <h4 class="text-sm font-medium text-foreground line-clamp-2 leading-tight">
                  {{ product.name }}
                </h4>
                <div class="flex items-center gap-1.5 mt-auto">
                  <span
                    class="text-sm font-bold"
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
                </div>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Ничего не найдено -->
      <div v-else-if="hasQuery && !isSearching" class="p-8 text-center">
        <Icon name="lucide:search-x" class="size-14 mx-auto text-muted-foreground/50 mb-3" />
        <h3 class="text-base font-semibold text-foreground mb-1">
          Ничего не найдено
        </h3>
        <p class="text-sm text-muted-foreground">
          Попробуйте изменить запрос
        </p>
      </div>

      <!-- История / подсказки -->
      <div v-else class="max-h-[60vh] overflow-y-auto p-4">
        <div v-if="suggestions.length > 0">
          <div class="flex items-center justify-between px-1 mb-2">
            <h3 class="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {{ hasQuery ? 'Из истории' : 'Недавние запросы' }}
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
          <div :id="LISTBOX_ID" role="listbox" aria-label="Подсказки" class="flex flex-col gap-1">
            <button
              v-for="(item, index) in suggestions"
              :id="suggestionOptions[index]?.id"
              :key="index"
              type="button"
              role="option"
              :aria-selected="isActive(suggestionOptions[index]?.id ?? '')"
              class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors text-left group"
              :class="{ 'bg-accent': isActive(suggestionOptions[index]?.id ?? '') }"
              @click="pickSuggestion(item.text)"
            >
              <Icon
                :name="item.type === 'history' ? 'lucide:history' : 'lucide:trending-up'"
                class="size-4 shrink-0"
                :class="item.type === 'history' ? 'text-muted-foreground' : 'text-primary'"
              />
              <span class="flex-1 truncate text-muted-foreground group-hover:text-foreground font-medium">
                {{ item.text }}
              </span>
              <button
                v-if="item.type === 'history'"
                type="button"
                class="size-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                aria-label="Удалить из истории"
                @click="onRemoveHistory(item.text, $event)"
              >
                <Icon name="lucide:x" class="size-4 text-muted-foreground hover:text-destructive" />
              </button>
            </button>
          </div>
        </div>
        <div v-else class="py-6 text-center text-sm text-muted-foreground">
          Начните вводить название товара или бренда
        </div>
      </div>
    </PopoverContent>
  </Popover>
</template>

<style scoped>
/* Стили ниже намеренно лежат в @layer components.

   Scoped-стиль в SFC по умолчанию компилируется ВНЕ слоёв, а утилиты
   Tailwind живут в @layer utilities. Беслойное правило бьёт слой независимо
   от специфичности, поэтому свой класс молча отменял бы утилиту на том же
   элементе (так на проекте умирали `hidden`, `lg:flex` и `gap-[...]`).

   Внутри слоя порядок нормальный: components объявлен раньше utilities, и
   утилита всегда перебивает класс. Значит раскладку можно править классом
   в разметке, не трогая этот блок.

   Подробности и порядок слоёв: docs/SCOPED_STYLES_TAILWIND_LAYERS.md */

@layer components {
  .sh-search {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 46px;
    padding: 0 18px;
    background: rgba(255, 255, 255, 0.95);
    border-radius: 999px;
    box-shadow: 0 1px 2px rgb(15 23 42 / 0.12);
  }

  .sh-search--dense {
    height: 38px;
    padding: 0 13px;
    gap: 8px;
    background: rgba(255, 255, 255, 0.55);
    border: 1px solid rgba(255, 255, 255, 0.7);
    border-radius: 12px;
    box-shadow: none;
  }

  .sh-search__icon {
    flex: none;
    width: 19px;
    height: 19px;
    color: var(--muted-foreground);
  }

  .sh-search--dense .sh-search__icon {
    width: 17px;
    height: 17px;
  }

  .sh-search__input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font: 500 15px var(--font-sans);
    color: var(--foreground);
  }

  .sh-search--dense .sh-search__input {
    font-size: 14px;
  }

  /* Safari на iOS зумит страницу при фокусе в поле, у которого font-size
     меньше 16px, и сам обратно не отзумливает — покупатель дозаполняет форму
     на увеличенном экране и вынужден сводить его пальцами. Единственный способ
     это выключить — дать полю ровно 16px и больше; `user-scalable=no` в
     viewport Safari игнорирует с iOS 10, а отключать масштабирование страницы
     нельзя и по доступности.

     Условие по pointer, а не только по ширине: на планшете в альбомной
     ориентации ширина десктопная, а зум при фокусе всё равно есть. */
  @media (pointer: coarse), (max-width: 1023px) {
    .sh-search__input,
    .sh-search--dense .sh-search__input {
      font-size: 16px;
    }
  }

  /* Убираем нативный крестик у type=search */
  .sh-search__input::-webkit-search-decoration,
  .sh-search__input::-webkit-search-cancel-button {
    appearance: none;
  }

  .sh-search__clear {
    flex: none;
    display: grid;
    place-content: center;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    color: var(--muted-foreground);
    transition:
      background 0.15s ease,
      color 0.15s ease;
  }

  .sh-search__clear:hover {
    background: var(--muted);
    color: var(--foreground);
  }

  .sh-search__submit {
    flex: none;
    height: 32px;
    padding: 0 16px;
    border: none;
    border-radius: 999px;
    background: var(--primary);
    color: #fff;
    font: 600 13.5px var(--font-sans);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s ease;
  }

  /* var(--blue-600) doesn't exist (Tailwind v4 generates --color-blue-600, and
     even that isn't guaranteed to survive tree-shaking) — --brand-hover is the
     already-proven literal for this exact primary-button-hover case, see
     StickySearchRow.vue / BrandsRail.vue. */
  .sh-search__submit:hover {
    background: var(--brand-hover);
  }

  /* Pulls the button flush toward the pill's own rounded edge instead of
     sitting inside the regular (symmetric) form padding — matches the
     mockup's own form, which used a tighter right pad (6px) than left (16px)
     specifically because the button supplies its own visual edge. Only
     applies when the button is actually rendered; doesn't touch the
     left/icon side or any other consumer's padding. */
  .sh-search--with-submit {
    padding-right: 6px;
  }
}
</style>
