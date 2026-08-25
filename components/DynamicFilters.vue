<script setup lang="ts">
import type { PropType } from 'vue'
import type { AttributeWithValue, BrandForFilter, ColorOptionMeta, Country, Material, ProductLine } from '@/types'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

// --- 1. PROPS & EMITS ---
interface NumericAttributeRange {
  min: number
  max: number
}

const props = defineProps({
  modelValue: {
    type: Object as PropType<{
      subCategoryIds: string[]
      price: [number, number]
      pieceCount: [number, number] | null
      brandIds: string[]
      productLineIds: string[]
      materialIds: string[]
      countryIds: string[]
      attributes: Record<string, (string | number)[]>
      numericAttributes: Record<number, [number, number]>
    }>,
    required: true,
  },
  isLoading: { type: Boolean, default: false },
  priceRange: {
    type: Object as PropType<{ min: number, max: number }>,
    required: true,
  },
  pieceCountRange: {
    type: Object as PropType<{ min: number, max: number } | null>,
    default: null,
  },
  availableBrands: {
    type: Array as PropType<BrandForFilter[]>,
    default: () => [],
  },
  availableProductLines: {
    type: Array as PropType<ProductLine[]>,
    default: () => [],
  },
  availableMaterials: {
    type: Array as PropType<Material[]>,
    default: () => [],
  },
  availableCountries: {
    type: Array as PropType<Country[]>,
    default: () => [],
  },
  availableFilters: {
    type: Array as PropType<AttributeWithValue[]>,
    default: () => [],
  },
  numericAttributeRanges: {
    type: Object as PropType<Record<number, NumericAttributeRange>>,
    default: () => ({}),
  },
})

const emit = defineEmits(['update:modelValue'])

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ И COMPUTEDS ---
const categoriesStore = useCategoriesStore()
const route = useRoute()

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))

// Фильтруем атрибуты - number_range заменён на слайдер piece_count, numeric обрабатывается отдельно
const displayableFilters = computed(() => {
  return props.availableFilters.filter(f => f.display_type !== 'number_range' && f.display_type !== 'numeric')
})

// Числовые атрибуты для отображения слайдеров
const numericFilters = computed(() => {
  return props.availableFilters.filter(f => f.display_type === 'numeric')
})

const localPrice = ref<[number, number]>([...props.modelValue.price])
const localPieceCount = ref<[number, number] | null>(props.modelValue.pieceCount ? [...props.modelValue.pieceCount] : null)
const localNumericAttributes = ref<Record<number, [number, number]>>(
  props.modelValue.numericAttributes ? { ...props.modelValue.numericAttributes } : {},
)

// Подсчет активных фильтров
const activeFiltersCount = computed(() => {
  let count = 0
  count += props.modelValue.subCategoryIds.length
  count += props.modelValue.brandIds.length
  count += props.modelValue.productLineIds?.length || 0
  count += props.modelValue.materialIds.length
  count += props.modelValue.countryIds.length
  Object.values(props.modelValue.attributes).forEach((values) => {
    count += values.length
  })
  if (props.modelValue.price[0] !== props.priceRange.min
    || props.modelValue.price[1] !== props.priceRange.max) {
    count += 1
  }
  // Фильтр по количеству деталей
  if (props.pieceCountRange && props.modelValue.pieceCount) {
    if (props.modelValue.pieceCount[0] !== props.pieceCountRange.min
      || props.modelValue.pieceCount[1] !== props.pieceCountRange.max) {
      count += 1
    }
  }
  // Числовые атрибуты
  if (props.modelValue.numericAttributes) {
    Object.entries(props.modelValue.numericAttributes).forEach(([attrId, range]) => {
      const attrRange = props.numericAttributeRanges[Number(attrId)]
      if (attrRange && (range[0] !== attrRange.min || range[1] !== attrRange.max)) {
        count += 1
      }
    })
  }
  return count
})

// --- 3. ОБРАБОТЧИКИ ИЗМЕНЕНИЙ ---

function updateSubCategory(checked: boolean, catId: string) {
  const newIds = new Set(props.modelValue.subCategoryIds)
  if (checked) {
    newIds.add(catId)
  }
  else {
    newIds.delete(catId)
  }
  emit('update:modelValue', { ...props.modelValue, subCategoryIds: Array.from(newIds) })
}

function updateAttribute(checked: boolean, attributeSlug: string, optionId: string | number) {
  const stringId = String(optionId)
  const currentSelection: string[] = (props.modelValue.attributes[attributeSlug] || []).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (checked)
    newSelection.add(stringId)
  else newSelection.delete(stringId)

  emit('update:modelValue', {
    ...props.modelValue,
    attributes: {
      ...props.modelValue.attributes,
      [attributeSlug]: Array.from(newSelection),
    },
  })
}

function updateDirectFilter(checked: boolean, key: 'brandIds' | 'productLineIds' | 'materialIds' | 'countryIds', id: string | number) {
  const stringId = String(id)
  const currentSelection: string[] = (props.modelValue[key] || []).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (checked)
    newSelection.add(stringId)
  else newSelection.delete(stringId)

  emit('update:modelValue', {
    ...props.modelValue,
    [key]: Array.from(newSelection),
  })
}

function commitPriceToFilters(newPrice: number[]) {
  if (Array.isArray(newPrice) && newPrice.length === 2) {
    emit('update:modelValue', { ...props.modelValue, price: newPrice as [number, number] })
  }
}

function commitPieceCountToFilters(newPieceCount: number[]) {
  if (Array.isArray(newPieceCount) && newPieceCount.length === 2) {
    emit('update:modelValue', { ...props.modelValue, pieceCount: newPieceCount as [number, number] })
  }
}

function commitNumericAttributeToFilters(attributeId: number, newValue: number[]) {
  if (Array.isArray(newValue) && newValue.length === 2) {
    emit('update:modelValue', {
      ...props.modelValue,
      numericAttributes: {
        ...props.modelValue.numericAttributes,
        [attributeId]: newValue as [number, number],
      },
    })
  }
}

function resetFilters() {
  // Сбрасываем числовые атрибуты до их диапазонов
  const resetNumericAttrs: Record<number, [number, number]> = {}
  Object.entries(props.numericAttributeRanges).forEach(([attrId, range]) => {
    resetNumericAttrs[Number(attrId)] = [range.min, range.max]
  })

  emit('update:modelValue', {
    subCategoryIds: [],
    price: [props.priceRange.min, props.priceRange.max],
    pieceCount: props.pieceCountRange ? [props.pieceCountRange.min, props.pieceCountRange.max] : null,
    brandIds: [],
    productLineIds: [],
    materialIds: [],
    countryIds: [],
    attributes: {},
    numericAttributes: resetNumericAttrs,
  })
}

// Синхронизируем локальную цену с пропсами
watch(() => props.modelValue.price, (newVal) => {
  localPrice.value = [...newVal]
}, { deep: true })

watch(() => props.priceRange, (newRange) => {
  localPrice.value = [newRange.min, newRange.max]
}, { deep: true })

// Синхронизируем локальное количество деталей с пропсами
watch(() => props.modelValue.pieceCount, (newVal) => {
  localPieceCount.value = newVal ? [...newVal] : null
}, { deep: true })

watch(() => props.pieceCountRange, (newRange) => {
  if (newRange) {
    localPieceCount.value = [newRange.min, newRange.max]
  }
  else {
    localPieceCount.value = null
  }
}, { deep: true })

// Синхронизируем локальные числовые атрибуты с пропсами
watch(() => props.modelValue.numericAttributes, (newVal) => {
  localNumericAttributes.value = newVal ? { ...newVal } : {}
}, { deep: true })

// При изменении диапазонов инициализируем локальные значения
watch(() => props.numericAttributeRanges, (newRanges) => {
  Object.entries(newRanges).forEach(([attrId, range]) => {
    const id = Number(attrId)
    if (!localNumericAttributes.value[id]) {
      localNumericAttributes.value[id] = [range.min, range.max]
    }
  })
}, { deep: true, immediate: true })

// --- 4. UI-МЕЛОЧИ (тонкий скроллбар, появляется только во время скролла) ---
const isScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | undefined

function onAsideScroll() {
  isScrolling.value = true
  clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, 700)
}

onUnmounted(() => {
  clearTimeout(scrollTimeout)
})
</script>

<template>
  <div class="df-aside thin-scroll" :class="{ scrolling: isScrolling }" @scroll="onAsideScroll">
    <div class="df-header-row">
      <span class="df-title">
        <Icon name="lucide:sliders-horizontal" class="df-title-icon" />
        Фильтры
      </span>
      <button v-if="activeFiltersCount > 0" type="button" class="df-reset" @click="resetFilters">
        Сбросить
      </button>
    </div>

    <!-- 1. ФИЛЬТР ПО ПОДКАТЕГОРИЯМ -->
    <div v-if="subcategories.length > 0" class="df-card df-card--tight">
      <button
        v-for="cat in subcategories"
        :key="cat.id"
        type="button"
        class="df-row"
        :class="{ 'df-row--active': props.modelValue.subCategoryIds.includes(cat.id) }"
        @click="updateSubCategory(!props.modelValue.subCategoryIds.includes(cat.id), cat.id)"
      >
        <span class="df-row-label">{{ cat.name }}</span>
      </button>
    </div>

    <!-- 2. БРЕНДЫ -->
    <div v-if="availableBrands.length > 0" class="df-card">
      <div class="df-card-title">
        Бренды
      </div>
      <button
        v-for="brand in availableBrands"
        :key="brand.id"
        type="button"
        class="df-row df-row--boxed"
        :class="{ 'df-row--active': modelValue.brandIds?.includes(brand.id) }"
        @click="updateDirectFilter(!modelValue.brandIds?.includes(brand.id), 'brandIds', brand.id)"
      >
        <span class="df-box" :class="{ 'df-box--active': modelValue.brandIds?.includes(brand.id) }">
          <Icon v-if="modelValue.brandIds?.includes(brand.id)" name="lucide:check" class="df-box-icon" />
        </span>
        <span class="df-row-label">{{ brand.name }}</span>
        <span v-if="brand.products_count" class="df-row-count">{{ brand.products_count }}</span>
      </button>
    </div>

    <!-- 2.5. ЛИНЕЙКИ ПРОДУКТОВ -->
    <div v-if="availableProductLines.length > 0" class="df-card">
      <div class="df-card-title">
        Линейки
      </div>
      <button
        v-for="line in availableProductLines"
        :key="line.id"
        type="button"
        class="df-row df-row--boxed"
        :class="{ 'df-row--active': modelValue.productLineIds?.includes(line.id) }"
        @click="updateDirectFilter(!modelValue.productLineIds?.includes(line.id), 'productLineIds', line.id)"
      >
        <span class="df-box" :class="{ 'df-box--active': modelValue.productLineIds?.includes(line.id) }">
          <Icon v-if="modelValue.productLineIds?.includes(line.id)" name="lucide:check" class="df-box-icon" />
        </span>
        <span class="df-row-label">{{ line.name }}</span>
      </button>
    </div>

    <!-- 3. МАТЕРИАЛЫ -->
    <div v-if="availableMaterials.length > 0" class="df-card">
      <div class="df-card-title">
        Материал
      </div>
      <button
        v-for="material in availableMaterials"
        :key="material.id"
        type="button"
        class="df-row df-row--boxed"
        :class="{ 'df-row--active': modelValue.materialIds?.includes(String(material.id)) }"
        @click="updateDirectFilter(!modelValue.materialIds?.includes(String(material.id)), 'materialIds', material.id)"
      >
        <span class="df-box" :class="{ 'df-box--active': modelValue.materialIds?.includes(String(material.id)) }">
          <Icon v-if="modelValue.materialIds?.includes(String(material.id))" name="lucide:check" class="df-box-icon" />
        </span>
        <span class="df-row-label">{{ material.name }}</span>
      </button>
    </div>

    <!-- 4. СТРАНЫ -->
    <div v-if="availableCountries.length > 0" class="df-card">
      <div class="df-card-title">
        Страна происхождения
      </div>
      <button
        v-for="country in availableCountries"
        :key="country.id"
        type="button"
        class="df-row df-row--boxed"
        :class="{ 'df-row--active': modelValue.countryIds?.includes(String(country.id)) }"
        @click="updateDirectFilter(!modelValue.countryIds?.includes(String(country.id)), 'countryIds', country.id)"
      >
        <span class="df-box" :class="{ 'df-box--active': modelValue.countryIds?.includes(String(country.id)) }">
          <Icon v-if="modelValue.countryIds?.includes(String(country.id))" name="lucide:check" class="df-box-icon" />
        </span>
        <span class="df-row-label">{{ country.name }}</span>
      </button>
    </div>

    <!-- 5. ДИНАМИЧЕСКИЕ АТРИБУТЫ (без number_range - он заменён на слайдер piece_count) -->
    <div
      v-for="filter in displayableFilters"
      :key="filter.id"
      class="df-card"
    >
      <div class="df-card-title">
        {{ filter.name }}
      </div>

      <!-- Для типа 'select' -->
      <template v-if="filter.display_type === 'select'">
        <button
          v-for="option in filter.attribute_options"
          :key="option.id"
          type="button"
          class="df-row df-row--boxed"
          :class="{ 'df-row--active': modelValue.attributes[filter.slug]?.includes(option.id) }"
          @click="updateAttribute(!modelValue.attributes[filter.slug]?.includes(option.id), filter.slug, option.id)"
        >
          <span class="df-box" :class="{ 'df-box--active': modelValue.attributes[filter.slug]?.includes(option.id) }">
            <Icon v-if="modelValue.attributes[filter.slug]?.includes(option.id)" name="lucide:check" class="df-box-icon" />
          </span>
          <span class="df-row-label">{{ option.value }}</span>
        </button>
      </template>

      <!-- Для типа 'color' -->
      <template v-if="filter.display_type === 'color'">
        <div class="df-color-grid">
          <button
            v-for="option in filter.attribute_options"
            :key="option.id"
            type="button"
            :title="option.value"
            class="df-color-item"
            :class="{ 'df-color-item--active': modelValue.attributes[filter.slug]?.includes(option.id) }"
            @click="() => {
              const isCurrentlyChecked = modelValue.attributes[filter.slug]?.includes(option.id);
              updateAttribute(!isCurrentlyChecked, filter.slug, option.id);
            }"
          >
            <span
              class="df-color-swatch"
              :style="{ backgroundColor: ((option.meta as unknown) as ColorOptionMeta)?.hex }"
            />
            <span class="df-color-label">{{ option.value }}</span>
          </button>
        </div>
      </template>
    </div>

    <!-- 5.5. ЧИСЛОВЫЕ АТРИБУТЫ (слайдеры) -->
    <ClientOnly v-for="numericFilter in numericFilters" :key="`numeric-${numericFilter.id}`">
      <div
        v-if="numericAttributeRanges[numericFilter.id] && localNumericAttributes[numericFilter.id]"
        class="df-card"
      >
        <div class="df-card-title">
          {{ numericFilter.name }}
        </div>

        <template v-if="isLoading">
          <div class="space-y-2 pb-3">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </template>
        <template v-else>
          <div class="df-slider-wrap">
            <Slider
              v-model="localNumericAttributes[numericFilter.id]"
              :min="numericAttributeRanges[numericFilter.id].min"
              :max="numericAttributeRanges[numericFilter.id].max"
              :step="1"
              @value-commit="(val: number[]) => commitNumericAttributeToFilters(numericFilter.id, val)"
            />
          </div>
          <div class="df-slider-values">
            <span>{{ localNumericAttributes[numericFilter.id][0] }} {{ (numericFilter as any).unit || '' }}</span>
            <span>{{ localNumericAttributes[numericFilter.id][1] }} {{ (numericFilter as any).unit || '' }}</span>
          </div>
        </template>
      </div>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div class="df-card">
          <div class="df-card-title">
            {{ numericFilter.name }}
          </div>
          <div class="space-y-2 pb-3">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- 6. ФИЛЬТР ПО ЦЕНЕ -->
    <ClientOnly>
      <div class="df-card">
        <div class="df-card-title">
          Цена, ₸
        </div>

        <template v-if="isLoading">
          <div class="space-y-2 pb-3">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </template>
        <template v-else>
          <div class="df-slider-wrap">
            <Slider
              v-model="localPrice"
              :min="priceRange.min"
              :max="priceRange.max"
              :step="100"
              @value-commit="commitPriceToFilters"
            />
          </div>
          <div class="df-slider-values">
            <span>{{ new Intl.NumberFormat('ru-RU').format(Math.round(localPrice[0])) }}&nbsp;₸</span>
            <span>{{ new Intl.NumberFormat('ru-RU').format(Math.round(localPrice[1])) }}&nbsp;₸</span>
          </div>
        </template>
      </div>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div class="df-card">
          <div class="df-card-title">
            Цена, ₸
          </div>
          <div class="space-y-2 pb-3">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- 7. ФИЛЬТР ПО КОЛИЧЕСТВУ ДЕТАЛЕЙ (для конструкторов) -->
    <ClientOnly v-if="pieceCountRange && localPieceCount">
      <div class="df-card">
        <div class="df-card-title">
          Количество деталей
        </div>

        <template v-if="isLoading">
          <div class="space-y-2 pb-3">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </template>
        <template v-else>
          <div class="df-slider-wrap">
            <Slider
              v-model="localPieceCount"
              :min="pieceCountRange.min"
              :max="pieceCountRange.max"
              :step="10"
              @value-commit="commitPieceCountToFilters"
            />
          </div>
          <div class="df-slider-values">
            <span>{{ localPieceCount[0] }} шт</span>
            <span>{{ localPieceCount[1] }} шт</span>
          </div>
        </template>
      </div>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div class="df-card">
          <div class="df-card-title">
            Количество деталей
          </div>
          <div class="space-y-2 pb-3">
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      </template>
    </ClientOnly>
  </div>
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
  .df-aside {
    /* Must clear CategoryScrollBar (fixed, top:0/z:90, ~59px tall) once it
       docks on scroll — SiteHeader itself is non-sticky on this page, so it's
       not a factor. Otherwise the "Фильтры" title and first row stick
       underneath it, hidden and unclickable. */
    position: sticky;
    top: 70px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-height: calc(100vh - 70px - 1rem);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding-right: 6px;
    padding-bottom: 8px;
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  .df-aside::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }

  .df-aside::-webkit-scrollbar-track {
    background: transparent;
    margin: 10px 0;
  }

  .df-aside::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 99px;
  }

  .df-aside.scrolling {
    scrollbar-color: rgba(100, 116, 139, 0.4) transparent;
  }

  .df-aside.scrolling::-webkit-scrollbar-thumb {
    background: rgba(100, 116, 139, 0.35);
  }

  .df-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px;
    flex: none;
  }

  .df-title {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font: 800 17px var(--font-sans);
    color: var(--foreground);
  }

  .df-title-icon {
    width: 17px;
    height: 17px;
    color: var(--primary);
  }

  .df-reset {
    border: none;
    background: transparent;
    cursor: pointer;
    font: 600 13px var(--font-sans);
    color: var(--primary);
    padding: 0;
  }

  .df-reset:hover {
    color: var(--blue-700);
  }

  .df-card {
    flex: none;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 16px 16px 8px;
  }

  .df-card--tight {
    padding: 8px;
  }

  .df-card-title {
    font: 700 15px var(--font-sans);
    color: var(--foreground);
    margin-bottom: 12px;
  }

  .df-card--tight .df-card-title {
    margin: 4px 0 6px 4px;
  }

  .df-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    height: 44px;
    padding: 0 10px;
    border: none;
    background: transparent;
    border-radius: 12px;
    cursor: pointer;
    text-align: left;
    font: 600 14px var(--font-sans);
    color: var(--foreground);
    margin-bottom: 8px;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }

  .df-row:last-child {
    margin-bottom: 0;
  }

  .df-row--boxed {
    margin-bottom: 4px;
    padding: 0 4px;
  }

  .df-row--active {
    background: rgba(43, 127, 255, 0.12);
    color: var(--primary);
  }

  .df-row-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .df-row-count {
    font: 500 12px var(--font-sans);
    color: var(--muted-foreground);
  }

  .df-box {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid var(--border);
    background: #fff;
    display: grid;
    place-content: center;
    transition: all 0.15s ease;
  }

  .df-box--active {
    border-color: var(--primary);
    background: var(--primary);
  }

  .df-box-icon {
    width: 13px;
    height: 13px;
    color: #fff;
  }

  .df-slider-wrap {
    padding: 6px 4px 12px;
  }

  .df-slider-values {
    display: flex;
    justify-content: space-between;
    font: 600 13px var(--font-sans);
    color: var(--muted-foreground);
    padding-bottom: 16px;
  }

  .df-color-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding-bottom: 12px;
  }

  .df-color-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 8px;
    border: none;
    border-radius: 12px;
    background: transparent;
    cursor: pointer;
  }

  .df-color-item--active {
    background: rgba(43, 127, 255, 0.1);
    box-shadow: 0 0 0 2px var(--primary) inset;
  }

  .df-color-swatch {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 2px solid var(--border);
  }

  .df-color-item--active .df-color-swatch {
    border-color: var(--primary);
  }

  .df-color-label {
    font: 500 11px var(--font-sans);
    color: var(--foreground);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
}
</style>
