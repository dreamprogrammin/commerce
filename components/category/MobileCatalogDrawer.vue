<script setup lang="ts">
import type { PropType } from 'vue'
import type { AttributeWithValue, BrandForFilter, ColorOptionMeta, Country, Material, ProductLine } from '@/types'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

interface NumericAttributeRange {
  min: number
  max: number
}

// --- 1. PROPS & EMITS ---
// Тот же контракт, что и у DynamicFiltersMobile.vue — прямой drop-in replacement.
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
  open: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'update:open'])

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ И COMPUTEDS ---
const categoriesStore = useCategoriesStore()
const route = useRoute()

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))

// select/checkbox-группы (карточки с рядами-чекбоксами)
const checkboxFilters = computed(() => {
  return props.availableFilters.filter(f => f.display_type === 'select')
})

// Атрибуты с цветовыми свотчами — отдельная секция с сеткой
const colorFilters = computed(() => {
  return props.availableFilters.filter(f => f.display_type === 'color')
})

// Числовые атрибуты — слайдеры
const numericFilters = computed(() => {
  return props.availableFilters.filter(f => f.display_type === 'numeric')
})

const localPrice = ref<[number, number]>([...props.modelValue.price])
const localPieceCount = ref<[number, number] | null>(props.modelValue.pieceCount ? [...props.modelValue.pieceCount] : null)
const localNumericAttributes = ref<Record<number, [number, number]>>(
  props.modelValue.numericAttributes ? { ...props.modelValue.numericAttributes } : {},
)

const priceMinInput = ref('')
const priceMaxInput = ref('')

function syncPriceInputs() {
  priceMinInput.value = String(Math.round(localPrice.value[0]))
  priceMaxInput.value = String(Math.round(localPrice.value[1]))
}
syncPriceInputs()

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

  if (props.pieceCountRange && props.modelValue.pieceCount) {
    if (props.modelValue.pieceCount[0] !== props.pieceCountRange.min
      || props.modelValue.pieceCount[1] !== props.pieceCountRange.max) {
      count += 1
    }
  }

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

const hasActiveFilters = computed(() => activeFiltersCount.value > 0)

// --- 3. ОБРАБОТЧИКИ ИЗМЕНЕНИЙ ---

function updateSubCategory(catId: string) {
  const newIds = new Set(props.modelValue.subCategoryIds)
  if (newIds.has(catId))
    newIds.delete(catId)
  else newIds.add(catId)
  emit('update:modelValue', { ...props.modelValue, subCategoryIds: Array.from(newIds) })
}

function updateAttribute(attributeSlug: string, optionId: string | number) {
  const stringId = String(optionId)
  const currentSelection: string[] = (props.modelValue.attributes[attributeSlug] || []).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (newSelection.has(stringId))
    newSelection.delete(stringId)
  else newSelection.add(stringId)

  emit('update:modelValue', {
    ...props.modelValue,
    attributes: {
      ...props.modelValue.attributes,
      [attributeSlug]: Array.from(newSelection),
    },
  })
}

function updateDirectFilter(key: 'brandIds' | 'productLineIds' | 'materialIds' | 'countryIds', id: string | number) {
  const stringId = String(id)
  const currentSelection: string[] = (props.modelValue[key] || []).map(String)
  const newSelection = new Set<string>(currentSelection)

  if (newSelection.has(stringId))
    newSelection.delete(stringId)
  else newSelection.add(stringId)

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

function onPriceMinChange() {
  const parsed = Number(priceMinInput.value.replace(/\D/g, ''))
  const min = Number.isFinite(parsed) && priceMinInput.value !== '' ? parsed : props.priceRange.min
  commitPriceToFilters([min, localPrice.value[1]])
}

function onPriceMaxChange() {
  const parsed = Number(priceMaxInput.value.replace(/\D/g, ''))
  const max = Number.isFinite(parsed) && priceMaxInput.value !== '' ? parsed : props.priceRange.max
  commitPriceToFilters([localPrice.value[0], max])
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
  const resetNumericAttrs: Record<number, [number, number]> = {}
  Object.entries(props.numericAttributeRanges).forEach(([attrId, range]) => {
    resetNumericAttrs[Number(attrId)] = [range.min, range.max]
  })

  emit('update:modelValue', {
    subCategoryIds: [],
    pieceCount: props.pieceCountRange ? [props.pieceCountRange.min, props.pieceCountRange.max] : null,
    price: [props.priceRange.min, props.priceRange.max],
    brandIds: [],
    productLineIds: [],
    materialIds: [],
    countryIds: [],
    attributes: {},
    numericAttributes: resetNumericAttrs,
  })
}

function closeDrawer() {
  emit('update:open', false)
}

// Синхронизация локального состояния с пропсами
watch(() => props.modelValue.price, (newVal) => {
  localPrice.value = [...newVal]
  syncPriceInputs()
}, { deep: true })

watch(() => props.priceRange, (newRange) => {
  localPrice.value = [newRange.min, newRange.max]
  syncPriceInputs()
}, { deep: true })

watch(() => props.modelValue.pieceCount, (newVal) => {
  localPieceCount.value = newVal ? [...newVal] : null
}, { deep: true })

watch(() => props.pieceCountRange, (newRange) => {
  localPieceCount.value = newRange ? [newRange.min, newRange.max] : null
}, { deep: true })

watch(() => props.modelValue.numericAttributes, (newVal) => {
  localNumericAttributes.value = newVal ? { ...newVal } : {}
}, { deep: true })

watch(() => props.numericAttributeRanges, (newRanges) => {
  Object.entries(newRanges).forEach(([attrId, range]) => {
    const id = Number(attrId)
    if (!localNumericAttributes.value[id]) {
      localNumericAttributes.value[id] = [range.min, range.max]
    }
  })
}, { deep: true, immediate: true })

// --- 4. UI-МЕЛОЧИ (скролл, лок скролла body) ---
const asideRef = ref<HTMLElement | null>(null)
const isScrolling = ref(false)
let scrollTimeout: ReturnType<typeof setTimeout> | undefined

function onDrawerScroll() {
  isScrolling.value = true
  clearTimeout(scrollTimeout)
  scrollTimeout = setTimeout(() => {
    isScrolling.value = false
  }, 700)
}

watch(() => props.open, (isOpen) => {
  if (!import.meta.client)
    return
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

onUnmounted(() => {
  if (import.meta.client)
    document.body.style.overflow = ''
  clearTimeout(scrollTimeout)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="mcd-overlay">
      <div v-if="open" class="mcd-overlay" @click="closeDrawer" />
    </Transition>

    <Transition name="mcd-sheet">
      <aside
        v-if="open"
        ref="asideRef"
        class="mcd-aside"
        :class="{ 'mcd-aside--scrolling': isScrolling }"
        @scroll="onDrawerScroll"
      >
        <div class="mcd-header">
          <span class="mcd-handle" />
          <div class="mcd-header-row">
            <span class="mcd-title">
              <Icon name="lucide:sliders-horizontal" class="mcd-title-icon" />
              Фильтры
            </span>
            <span class="mcd-header-actions">
              <button v-if="hasActiveFilters" type="button" class="mcd-reset" @click="resetFilters">
                Сбросить
              </button>
              <button type="button" class="mcd-close" aria-label="Закрыть" @click="closeDrawer">
                <Icon name="lucide:x" class="mcd-close-icon" />
              </button>
            </span>
          </div>
        </div>

        <!-- Подкатегории -->
        <div v-if="subcategories.length > 0" class="mcd-card mcd-card--tight">
          <button
            v-for="cat in subcategories"
            :key="cat.id"
            type="button"
            class="mcd-row"
            :class="{ 'mcd-row--active': modelValue.subCategoryIds.includes(cat.id) }"
            @click="updateSubCategory(cat.id)"
          >
            <span class="mcd-row-label">{{ cat.name }}</span>
          </button>
        </div>

        <!-- Цена -->
        <div class="mcd-card">
          <div class="mcd-card-title">
            Цена, ₸
          </div>
          <div class="mcd-price-row">
            <input
              v-model="priceMinInput"
              inputmode="numeric"
              class="mcd-price-input"
              :placeholder="`от ${formatPrice(priceRange.min)}`"
              @change="onPriceMinChange"
            >
            <input
              v-model="priceMaxInput"
              inputmode="numeric"
              class="mcd-price-input"
              :placeholder="`до ${formatPrice(priceRange.max)}`"
              @change="onPriceMaxChange"
            >
          </div>
        </div>

        <!-- Количество деталей -->
        <div v-if="pieceCountRange && localPieceCount" class="mcd-card">
          <div class="mcd-card-title">
            Количество деталей
          </div>
          <div class="mcd-slider-wrap">
            <Slider
              v-model="localPieceCount"
              :min="pieceCountRange.min"
              :max="pieceCountRange.max"
              :step="10"
              @value-commit="commitPieceCountToFilters"
            />
          </div>
          <div class="mcd-slider-values">
            <span>{{ localPieceCount[0] }} шт</span>
            <span>{{ localPieceCount[1] }} шт</span>
          </div>
        </div>

        <!-- Числовые атрибуты -->
        <div
          v-for="filter in numericFilters"
          v-show="numericAttributeRanges[filter.id] && localNumericAttributes[filter.id]"
          :key="`numeric-${filter.id}`"
          class="mcd-card"
        >
          <div class="mcd-card-title">
            {{ filter.name }}
          </div>
          <template v-if="numericAttributeRanges[filter.id] && localNumericAttributes[filter.id]">
            <div class="mcd-slider-wrap">
              <Slider
                v-model="localNumericAttributes[filter.id]"
                :min="numericAttributeRanges[filter.id].min"
                :max="numericAttributeRanges[filter.id].max"
                :step="1"
                @value-commit="(val: number[]) => commitNumericAttributeToFilters(filter.id, val)"
              />
            </div>
            <div class="mcd-slider-values">
              <span>{{ localNumericAttributes[filter.id][0] }} {{ (filter as any).unit || '' }}</span>
              <span>{{ localNumericAttributes[filter.id][1] }} {{ (filter as any).unit || '' }}</span>
            </div>
          </template>
        </div>

        <!-- Бренды -->
        <div v-if="availableBrands.length > 0" class="mcd-card">
          <div class="mcd-card-title">
            Бренды
          </div>
          <button
            v-for="brand in availableBrands"
            :key="brand.id"
            type="button"
            class="mcd-row mcd-row--boxed"
            :class="{ 'mcd-row--active': modelValue.brandIds.includes(brand.id) }"
            @click="updateDirectFilter('brandIds', brand.id)"
          >
            <span class="mcd-box" :class="{ 'mcd-box--active': modelValue.brandIds.includes(brand.id) }">
              <Icon v-if="modelValue.brandIds.includes(brand.id)" name="lucide:check" class="mcd-box-icon" />
            </span>
            <span class="mcd-row-label">{{ brand.name }}</span>
            <span v-if="brand.products_count" class="mcd-row-count">{{ brand.products_count }}</span>
          </button>
        </div>

        <!-- Линейки продуктов -->
        <div v-if="availableProductLines.length > 0" class="mcd-card">
          <div class="mcd-card-title">
            Линейки
          </div>
          <button
            v-for="line in availableProductLines"
            :key="line.id"
            type="button"
            class="mcd-row mcd-row--boxed"
            :class="{ 'mcd-row--active': modelValue.productLineIds?.includes(line.id) }"
            @click="updateDirectFilter('productLineIds', line.id)"
          >
            <span class="mcd-box" :class="{ 'mcd-box--active': modelValue.productLineIds?.includes(line.id) }">
              <Icon v-if="modelValue.productLineIds?.includes(line.id)" name="lucide:check" class="mcd-box-icon" />
            </span>
            <span class="mcd-row-label">{{ line.name }}</span>
          </button>
        </div>

        <!-- Материалы -->
        <div v-if="availableMaterials.length > 0" class="mcd-card">
          <div class="mcd-card-title">
            Материал
          </div>
          <button
            v-for="material in availableMaterials"
            :key="material.id"
            type="button"
            class="mcd-row mcd-row--boxed"
            :class="{ 'mcd-row--active': modelValue.materialIds.includes(String(material.id)) }"
            @click="updateDirectFilter('materialIds', material.id)"
          >
            <span class="mcd-box" :class="{ 'mcd-box--active': modelValue.materialIds.includes(String(material.id)) }">
              <Icon v-if="modelValue.materialIds.includes(String(material.id))" name="lucide:check" class="mcd-box-icon" />
            </span>
            <span class="mcd-row-label">{{ material.name }}</span>
          </button>
        </div>

        <!-- Страны -->
        <div v-if="availableCountries.length > 0" class="mcd-card">
          <div class="mcd-card-title">
            Страна происхождения
          </div>
          <button
            v-for="country in availableCountries"
            :key="country.id"
            type="button"
            class="mcd-row mcd-row--boxed"
            :class="{ 'mcd-row--active': modelValue.countryIds.includes(String(country.id)) }"
            @click="updateDirectFilter('countryIds', country.id)"
          >
            <span class="mcd-box" :class="{ 'mcd-box--active': modelValue.countryIds.includes(String(country.id)) }">
              <Icon v-if="modelValue.countryIds.includes(String(country.id))" name="lucide:check" class="mcd-box-icon" />
            </span>
            <span class="mcd-row-label">{{ country.name }}</span>
          </button>
        </div>

        <!-- Динамические select-атрибуты -->
        <div v-for="filter in checkboxFilters" :key="filter.id" class="mcd-card">
          <div class="mcd-card-title">
            {{ filter.name }}
          </div>
          <button
            v-for="option in filter.attribute_options"
            :key="option.id"
            type="button"
            class="mcd-row mcd-row--boxed"
            :class="{ 'mcd-row--active': modelValue.attributes[filter.slug]?.includes(option.id) }"
            @click="updateAttribute(filter.slug, option.id)"
          >
            <span class="mcd-box" :class="{ 'mcd-box--active': modelValue.attributes[filter.slug]?.includes(option.id) }">
              <Icon v-if="modelValue.attributes[filter.slug]?.includes(option.id)" name="lucide:check" class="mcd-box-icon" />
            </span>
            <span class="mcd-row-label">{{ option.value }}</span>
          </button>
        </div>

        <!-- Цветовые атрибуты -->
        <div v-for="filter in colorFilters" :key="`color-${filter.id}`" class="mcd-card">
          <div class="mcd-card-title">
            {{ filter.name }}
          </div>
          <div class="mcd-color-grid">
            <button
              v-for="option in filter.attribute_options"
              :key="option.id"
              type="button"
              class="mcd-color-item"
              :class="{ 'mcd-color-item--active': modelValue.attributes[filter.slug]?.includes(option.id) }"
              :title="option.value"
              @click="updateAttribute(filter.slug, option.id)"
            >
              <span
                class="mcd-color-swatch"
                :style="{ backgroundColor: ((option.meta as unknown) as ColorOptionMeta)?.hex }"
              />
              <span class="mcd-color-label">{{ option.value }}</span>
            </button>
          </div>
        </div>

        <div class="mcd-footer">
          <button type="button" class="mcd-apply" @click="closeDrawer">
            Показать товары
          </button>
        </div>
      </aside>
    </Transition>
  </Teleport>
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
  .mcd-overlay {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: rgba(15, 23, 42, 0.44);
  }

  .mcd-overlay-enter-active,
  .mcd-overlay-leave-active {
    transition: opacity 0.28s ease;
  }

  .mcd-overlay-enter-from,
  .mcd-overlay-leave-to {
    opacity: 0;
  }

  .mcd-aside {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 90;
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    gap: 12px;
    background: rgba(238, 240, 243, 0.8);
    backdrop-filter: blur(26px) saturate(1.8);
    -webkit-backdrop-filter: blur(26px) saturate(1.8);
    border-radius: 22px 22px 0 0;
    padding: 0 14px 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    box-shadow: 0 -18px 48px rgba(15, 23, 42, 0.22);
    font-family: var(--font-sans);
    scrollbar-width: thin;
    scrollbar-color: transparent transparent;
  }

  .mcd-aside::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }

  .mcd-aside::-webkit-scrollbar-track {
    background: transparent;
    margin: 10px 0;
  }

  .mcd-aside::-webkit-scrollbar-thumb {
    background: transparent;
    border-radius: 99px;
  }

  .mcd-aside--scrolling {
    scrollbar-color: rgba(100, 116, 139, 0.4) transparent;
  }

  .mcd-aside--scrolling::-webkit-scrollbar-thumb {
    background: rgba(100, 116, 139, 0.35);
  }

  .mcd-sheet-enter-active,
  .mcd-sheet-leave-active {
    transition: transform 0.34s cubic-bezier(0.32, 0.72, 0.33, 1);
  }

  .mcd-sheet-enter-from,
  .mcd-sheet-leave-to {
    transform: translateY(103%);
  }

  .mcd-header {
    position: sticky;
    top: 0;
    z-index: 5;
    margin: 0 -14px;
    padding: 9px 20px 10px;
    background: rgba(238, 240, 243, 0.72);
    backdrop-filter: blur(18px) saturate(1.6);
    -webkit-backdrop-filter: blur(18px) saturate(1.6);
    border-radius: 22px 22px 0 0;
    display: flex;
    flex-direction: column;
  }

  .mcd-handle {
    width: 40px;
    height: 4px;
    border-radius: 999px;
    background: #d1d5db;
    margin: 0 auto 10px;
  }

  .mcd-header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .mcd-title {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font: 800 18px var(--font-sans);
    color: var(--foreground);
  }

  .mcd-title-icon {
    width: 18px;
    height: 18px;
    color: var(--primary);
  }

  .mcd-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }

  .mcd-reset {
    border: none;
    background: transparent;
    cursor: pointer;
    font: 600 14px var(--font-sans);
    color: var(--primary);
    padding: 0;
  }

  .mcd-close {
    width: 34px;
    height: 34px;
    border: 1px solid rgba(255, 255, 255, 0.9);
    border-radius: 999px;
    background: linear-gradient(150deg, rgba(255, 255, 255, 0.95), rgba(224, 233, 247, 0.6));
    backdrop-filter: blur(10px) saturate(1.6);
    -webkit-backdrop-filter: blur(10px) saturate(1.6);
    box-shadow:
      inset 0 1px 0 #fff,
      0 3px 10px rgba(15, 23, 42, 0.1);
    display: grid;
    place-content: center;
    cursor: pointer;
  }

  .mcd-close-icon {
    width: 18px;
    height: 18px;
    color: var(--foreground);
  }

  .mcd-card {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 16px 16px 8px;
  }

  .mcd-card--tight {
    padding: 8px;
  }

  .mcd-card-title {
    font: 700 15px var(--font-sans);
    color: var(--foreground);
    margin-bottom: 12px;
  }

  .mcd-card--tight .mcd-card-title {
    margin-bottom: 6px;
  }

  .mcd-row {
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
  }

  .mcd-row:last-child {
    margin-bottom: 0;
  }

  .mcd-row--boxed {
    margin-bottom: 4px;
    padding: 0 4px;
  }

  .mcd-row--active {
    background: rgba(43, 127, 255, 0.12);
    color: var(--primary);
  }

  .mcd-row-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .mcd-row-count {
    font: 500 12px var(--font-sans);
    color: var(--muted-foreground);
  }

  .mcd-box {
    flex: none;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid var(--border);
    background: #fff;
    display: grid;
    place-content: center;
  }

  .mcd-box--active {
    border-color: var(--primary);
    background: var(--primary);
  }

  .mcd-box-icon {
    width: 13px;
    height: 13px;
    color: #fff;
  }

  .mcd-price-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 16px;
  }

  .mcd-price-input {
    width: 0;
    flex: 1;
    height: 44px;
    padding: 0 13px;
    border: 1px solid transparent;
    border-radius: 12px;
    background: var(--muted);
    font: 600 14px var(--font-sans);
    color: var(--foreground);
    outline: none;
  }

  .mcd-price-input::placeholder {
    color: var(--muted-foreground);
  }

  .mcd-price-input:focus {
    border-color: var(--primary);
    background: #fff;
  }

  .mcd-slider-wrap {
    padding: 2px 4px 12px;
  }

  .mcd-slider-values {
    display: flex;
    justify-content: space-between;
    font: 600 13px var(--font-sans);
    color: var(--muted-foreground);
    padding-bottom: 16px;
  }

  .mcd-color-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    padding-bottom: 12px;
  }

  .mcd-color-item {
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

  .mcd-color-item--active {
    background: rgba(43, 127, 255, 0.1);
    box-shadow: 0 0 0 2px var(--primary) inset;
  }

  .mcd-color-swatch {
    width: 34px;
    height: 34px;
    border-radius: 10px;
    border: 2px solid var(--border);
  }

  .mcd-color-item--active .mcd-color-swatch {
    border-color: var(--primary);
  }

  .mcd-color-label {
    font: 500 11px var(--font-sans);
    color: var(--foreground);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .mcd-footer {
    position: sticky;
    bottom: 0;
    z-index: 5;
    margin: 4px -14px 0;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: linear-gradient(180deg, rgba(238, 240, 243, 0) 0%, rgba(238, 240, 243, 0.88) 34%);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
  }

  .mcd-apply {
    width: 100%;
    height: 52px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    background: linear-gradient(150deg, rgba(77, 148, 255, 0.95), rgba(23, 101, 235, 0.85));
    backdrop-filter: blur(12px) saturate(1.7);
    -webkit-backdrop-filter: blur(12px) saturate(1.7);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.55),
      inset 0 -2px 8px rgba(6, 53, 138, 0.28),
      0 10px 26px rgba(43, 127, 255, 0.4);
    color: #fff;
    font: 700 15px var(--font-sans);
    cursor: pointer;
  }

  .mcd-apply:active {
    transform: scale(0.98);
  }
}
</style>
