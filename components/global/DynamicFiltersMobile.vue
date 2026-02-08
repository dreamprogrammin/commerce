<script setup lang="ts">
import type { PropType } from 'vue'
import type { AttributeWithValue, BrandForFilter, ColorOptionMeta, Country, Material, ProductLine } from '@/types'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

interface NumericAttributeRange {
  min: number
  max: number
}

// --- 1. PROPS & EMITS ---
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

  // Подкатегории
  count += props.modelValue.subCategoryIds.length

  // Бренды
  count += props.modelValue.brandIds.length

  // Линейки
  count += props.modelValue.productLineIds?.length || 0

  // Материалы
  count += props.modelValue.materialIds.length

  // Страны
  count += props.modelValue.countryIds.length

  // Атрибуты
  Object.values(props.modelValue.attributes).forEach((values) => {
    count += values.length
  })

  // Цена (если отличается от диапазона)
  if (props.modelValue.price[0] !== props.priceRange.min
    || props.modelValue.price[1] !== props.priceRange.max) {
    count += 1
  }

  // Количество деталей (если отличается от диапазона)
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

function closeSheet() {
  emit('update:open', false)
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
</script>

<template>
  <Drawer :open="open" @update:open="(val) => emit('update:open', val)">
    <DrawerContent class="max-h-[90vh]">
      <!-- Заголовок -->
      <DrawerHeader>
        <DrawerTitle class="flex items-center gap-2">
          <Icon name="lucide:sliders-horizontal" class="w-5 h-5" />
          Фильтры товаров
        </DrawerTitle>
        <DrawerDescription v-if="activeFiltersCount > 0">
          Активно фильтров: {{ activeFiltersCount }}
        </DrawerDescription>
        <DrawerDescription v-else>
          Настройте параметры для поиска товаров
        </DrawerDescription>
      </DrawerHeader>

      <!-- Контент с прокруткой -->
      <div class="px-4 pb-6 space-y-3 max-h-[60vh] overflow-y-auto">
        <!-- 1. ФИЛЬТР ПО ПОДКАТЕГОРИЯМ -->
        <div v-if="subcategories.length > 0" class="space-y-2">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:layers" class="w-4 h-4 text-muted-foreground" />
            <h4 class="font-semibold text-base">
              Подкатегории
            </h4>
          </div>
          <button
            v-for="cat in subcategories"
            :key="cat.id"
            type="button"
            class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
            :class="[
              props.modelValue.subCategoryIds.includes(cat.id)
                ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/25'
                : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
            ]"
            @click="updateSubCategory(!props.modelValue.subCategoryIds.includes(cat.id), cat.id)"
          >
            <div
              class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              :class="props.modelValue.subCategoryIds.includes(cat.id) ? 'bg-white/20' : 'bg-background/50'"
            >
              <Icon
                :name="props.modelValue.subCategoryIds.includes(cat.id) ? 'lucide:check' : 'lucide:folder'"
                class="w-5 h-5"
              />
            </div>
            <div class="flex-1 text-left">
              <div class="font-semibold text-base">
                {{ cat.name }}
              </div>
            </div>
          </button>
        </div>

        <!-- 2. БРЕНДЫ -->
        <div v-if="availableBrands.length > 0" class="space-y-2 pt-4 border-t">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:tag" class="w-4 h-4 text-muted-foreground" />
            <h4 class="font-semibold text-base">
              Бренды
            </h4>
          </div>
          <button
            v-for="brand in availableBrands"
            :key="brand.id"
            type="button"
            class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
            :class="[
              modelValue.brandIds?.includes(brand.id)
                ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/25'
                : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
            ]"
            @click="updateDirectFilter(!modelValue.brandIds?.includes(brand.id), 'brandIds', brand.id)"
          >
            <div
              class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              :class="modelValue.brandIds?.includes(brand.id) ? 'bg-white/20' : 'bg-background/50'"
            >
              <Icon
                :name="modelValue.brandIds?.includes(brand.id) ? 'lucide:check' : 'lucide:award'"
                class="w-5 h-5"
              />
            </div>
            <div class="flex-1 text-left">
              <div class="font-semibold text-base">
                {{ brand.name }}
              </div>
            </div>
          </button>
        </div>

        <!-- 2.5. ЛИНЕЙКИ ПРОДУКТОВ -->
        <div v-if="availableProductLines.length > 0" class="space-y-2 pt-4 border-t">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:sparkles" class="w-4 h-4 text-muted-foreground" />
            <h4 class="font-semibold text-base">
              Линейки
            </h4>
          </div>
          <button
            v-for="line in availableProductLines"
            :key="line.id"
            type="button"
            class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
            :class="[
              modelValue.productLineIds?.includes(line.id)
                ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg shadow-pink-500/25'
                : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
            ]"
            @click="updateDirectFilter(!modelValue.productLineIds?.includes(line.id), 'productLineIds', line.id)"
          >
            <div
              class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              :class="modelValue.productLineIds?.includes(line.id) ? 'bg-white/20' : 'bg-background/50'"
            >
              <Icon
                :name="modelValue.productLineIds?.includes(line.id) ? 'lucide:check' : 'lucide:sparkles'"
                class="w-5 h-5"
              />
            </div>
            <div class="flex-1 text-left">
              <div class="font-semibold text-base">
                {{ line.name }}
              </div>
            </div>
          </button>
        </div>

        <!-- 3. МАТЕРИАЛЫ -->
        <div v-if="availableMaterials.length > 0" class="space-y-2 pt-4 border-t">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:layers-2" class="w-4 h-4 text-muted-foreground" />
            <h4 class="font-semibold text-base">
              Материал
            </h4>
          </div>
          <button
            v-for="material in availableMaterials"
            :key="material.id"
            type="button"
            class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
            :class="[
              modelValue.materialIds?.includes(String(material.id))
                ? 'bg-gradient-to-r from-green-500 to-green-600 text-white shadow-lg shadow-green-500/25'
                : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
            ]"
            @click="updateDirectFilter(!modelValue.materialIds?.includes(String(material.id)), 'materialIds', material.id)"
          >
            <div
              class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              :class="modelValue.materialIds?.includes(String(material.id)) ? 'bg-white/20' : 'bg-background/50'"
            >
              <Icon
                :name="modelValue.materialIds?.includes(String(material.id)) ? 'lucide:check' : 'lucide:box'"
                class="w-5 h-5"
              />
            </div>
            <div class="flex-1 text-left">
              <div class="font-semibold text-base">
                {{ material.name }}
              </div>
            </div>
          </button>
        </div>

        <!-- 4. СТРАНЫ -->
        <div v-if="availableCountries.length > 0" class="space-y-2 pt-4 border-t">
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:globe" class="w-4 h-4 text-muted-foreground" />
            <h4 class="font-semibold text-base">
              Страна происхождения
            </h4>
          </div>
          <button
            v-for="country in availableCountries"
            :key="country.id"
            type="button"
            class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
            :class="[
              modelValue.countryIds?.includes(String(country.id))
                ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/25'
                : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
            ]"
            @click="updateDirectFilter(!modelValue.countryIds?.includes(String(country.id)), 'countryIds', country.id)"
          >
            <div
              class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
              :class="modelValue.countryIds?.includes(String(country.id)) ? 'bg-white/20' : 'bg-background/50'"
            >
              <Icon
                :name="modelValue.countryIds?.includes(String(country.id)) ? 'lucide:check' : 'lucide:map-pin'"
                class="w-5 h-5"
              />
            </div>
            <div class="flex-1 text-left">
              <div class="font-semibold text-base">
                {{ country.name }}
              </div>
            </div>
          </button>
        </div>

        <!-- 5. ДИНАМИЧЕСКИЕ АТРИБУТЫ (без number_range - он заменён на слайдер piece_count) -->
        <div
          v-for="filter in displayableFilters"
          :key="filter.id"
          class="space-y-2 pt-4 border-t"
        >
          <div class="flex items-center gap-2 mb-3">
            <Icon name="lucide:settings-2" class="w-4 h-4 text-muted-foreground" />
            <h4 class="font-semibold text-base">
              {{ filter.name }}
            </h4>
          </div>

          <!-- Для типа 'select' -->
          <template v-if="filter.display_type === 'select'">
            <div class="space-y-2">
              <button
                v-for="option in filter.attribute_options"
                :key="option.id"
                type="button"
                class="w-full flex items-center gap-4 p-4 rounded-xl transition-all duration-200"
                :class="[
                  modelValue.attributes[filter.slug]?.includes(option.id)
                    ? 'bg-gradient-to-r from-pink-500 to-pink-600 text-white shadow-lg shadow-pink-500/25'
                    : 'bg-secondary/60 hover:bg-secondary hover:shadow-md active:scale-[0.98]',
                ]"
                @click="updateAttribute(!modelValue.attributes[filter.slug]?.includes(option.id), filter.slug, option.id)"
              >
                <div
                  class="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
                  :class="modelValue.attributes[filter.slug]?.includes(option.id) ? 'bg-white/20' : 'bg-background/50'"
                >
                  <Icon
                    :name="modelValue.attributes[filter.slug]?.includes(option.id) ? 'lucide:check' : 'lucide:circle'"
                    class="w-5 h-5"
                  />
                </div>
                <div class="flex-1 text-left">
                  <div class="font-semibold text-base">
                    {{ option.value }}
                  </div>
                </div>
              </button>
            </div>
          </template>

          <!-- Для типа 'color' -->
          <template v-if="filter.display_type === 'color'">
            <div class="grid grid-cols-4 gap-3 pt-2">
              <button
                v-for="option in filter.attribute_options"
                :key="option.id"
                type="button"
                :title="option.value"
                class="relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all duration-200"
                :class="[
                  modelValue.attributes[filter.slug]?.includes(option.id)
                    ? 'bg-primary/10 ring-2 ring-primary'
                    : 'bg-secondary/60 hover:bg-secondary active:scale-95',
                ]"
                @click="() => {
                  const isCurrentlyChecked = modelValue.attributes[filter.slug]?.includes(option.id);
                  updateAttribute(!isCurrentlyChecked, filter.slug, option.id);
                }"
              >
                <div
                  :style="{ backgroundColor: ((option.meta as unknown) as ColorOptionMeta)?.hex }"
                  class="h-12 w-12 rounded-lg border-2 transition-transform"
                  :class="{
                    'border-primary scale-110': modelValue.attributes[filter.slug]?.includes(option.id),
                    'border-border': !modelValue.attributes[filter.slug]?.includes(option.id),
                  }"
                />
                <span class="text-xs font-medium text-center line-clamp-1">
                  {{ option.value }}
                </span>
                <Icon
                  v-if="modelValue.attributes[filter.slug]?.includes(option.id)"
                  name="lucide:check-circle"
                  class="absolute top-1 right-1 w-5 h-5 text-primary"
                />
              </button>
            </div>
          </template>

        </div>

        <!-- 5.5. ЧИСЛОВЫЕ АТРИБУТЫ (слайдеры) -->
        <ClientOnly v-for="numericFilter in numericFilters" :key="`numeric-${numericFilter.id}`">
          <div
            v-if="numericAttributeRanges[numericFilter.id] && localNumericAttributes[numericFilter.id]"
            class="space-y-4 pt-4 border-t"
          >
            <div class="flex items-center gap-2">
              <Icon name="lucide:ruler" class="w-4 h-4 text-muted-foreground" />
              <h4 class="font-semibold text-base">
                {{ numericFilter.name }}
              </h4>
            </div>

            <template v-if="isLoading">
              <div class="space-y-4 pt-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-1/2" />
              </div>
            </template>
            <template v-else>
              <div class="px-2 pt-2">
                <Slider
                  v-model="localNumericAttributes[numericFilter.id]"
                  :min="numericAttributeRanges[numericFilter.id].min"
                  :max="numericAttributeRanges[numericFilter.id].max"
                  :step="1"
                  @value-commit="(val: number[]) => commitNumericAttributeToFilters(numericFilter.id, val)"
                />
              </div>
              <div class="flex justify-between items-center gap-2">
                <div class="flex-1 p-3 rounded-lg bg-secondary/60 text-center">
                  <div class="text-xs text-muted-foreground mb-1">
                    От
                  </div>
                  <div class="font-semibold">
                    {{ localNumericAttributes[numericFilter.id][0] }} {{ (numericFilter as any).unit || '' }}
                  </div>
                </div>
                <Icon name="lucide:minus" class="w-4 h-4 text-muted-foreground" />
                <div class="flex-1 p-3 rounded-lg bg-secondary/60 text-center">
                  <div class="text-xs text-muted-foreground mb-1">
                    До
                  </div>
                  <div class="font-semibold">
                    {{ localNumericAttributes[numericFilter.id][1] }} {{ (numericFilter as any).unit || '' }}
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Fallback для SSR -->
          <template #fallback>
            <div class="space-y-4 pt-4 border-t">
              <div class="flex items-center gap-2">
                <Icon name="lucide:ruler" class="w-4 h-4 text-muted-foreground" />
                <h4 class="font-semibold text-base">
                  {{ numericFilter.name }}
                </h4>
              </div>
              <div class="space-y-4 pt-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-1/2" />
              </div>
            </div>
          </template>
        </ClientOnly>

        <!-- 6. ФИЛЬТР ПО ЦЕНЕ -->
        <ClientOnly>
          <div class="space-y-4 pt-4 border-t pb-4">
            <div class="flex items-center gap-2">
              <Icon name="lucide:wallet" class="w-4 h-4 text-muted-foreground" />
              <h4 class="font-semibold text-base">
                Цена
              </h4>
            </div>

            <template v-if="isLoading">
              <div class="space-y-4 pt-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-1/2" />
              </div>
            </template>
            <template v-else>
              <div class="px-2 pt-2">
                <Slider
                  v-model="localPrice"
                  :min="priceRange.min"
                  :max="priceRange.max"
                  :step="100"
                  @value-commit="commitPriceToFilters"
                />
              </div>
              <div class="flex justify-between items-center gap-2">
                <div class="flex-1 p-3 rounded-lg bg-secondary/60 text-center">
                  <div class="text-xs text-muted-foreground mb-1">
                    От
                  </div>
                  <div class="font-semibold">
                    {{ Math.round(localPrice[0]).toLocaleString() }} ₸
                  </div>
                </div>
                <Icon name="lucide:minus" class="w-4 h-4 text-muted-foreground" />
                <div class="flex-1 p-3 rounded-lg bg-secondary/60 text-center">
                  <div class="text-xs text-muted-foreground mb-1">
                    До
                  </div>
                  <div class="font-semibold">
                    {{ Math.round(localPrice[1]).toLocaleString() }} ₸
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Fallback для SSR -->
          <template #fallback>
            <div class="space-y-4 pt-4 border-t pb-4">
              <div class="flex items-center gap-2">
                <Icon name="lucide:wallet" class="w-4 h-4 text-muted-foreground" />
                <h4 class="font-semibold text-base">
                  Цена
                </h4>
              </div>
              <div class="space-y-4 pt-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-1/2" />
              </div>
            </div>
          </template>
        </ClientOnly>

        <!-- 7. ФИЛЬТР ПО КОЛИЧЕСТВУ ДЕТАЛЕЙ (для конструкторов) -->
        <ClientOnly v-if="pieceCountRange && localPieceCount">
          <div class="space-y-4 pt-4 border-t pb-4">
            <div class="flex items-center gap-2">
              <Icon name="lucide:puzzle" class="w-4 h-4 text-muted-foreground" />
              <h4 class="font-semibold text-base">
                Количество деталей
              </h4>
            </div>

            <template v-if="isLoading">
              <div class="space-y-4 pt-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-1/2" />
              </div>
            </template>
            <template v-else>
              <div class="px-2 pt-2">
                <Slider
                  v-model="localPieceCount"
                  :min="pieceCountRange.min"
                  :max="pieceCountRange.max"
                  :step="10"
                  @value-commit="commitPieceCountToFilters"
                />
              </div>
              <div class="flex justify-between items-center gap-2">
                <div class="flex-1 p-3 rounded-lg bg-secondary/60 text-center">
                  <div class="text-xs text-muted-foreground mb-1">
                    От
                  </div>
                  <div class="font-semibold">
                    {{ localPieceCount[0] }} шт
                  </div>
                </div>
                <Icon name="lucide:minus" class="w-4 h-4 text-muted-foreground" />
                <div class="flex-1 p-3 rounded-lg bg-secondary/60 text-center">
                  <div class="text-xs text-muted-foreground mb-1">
                    До
                  </div>
                  <div class="font-semibold">
                    {{ localPieceCount[1] }} шт
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Fallback для SSR -->
          <template #fallback>
            <div class="space-y-4 pt-4 border-t pb-4">
              <div class="flex items-center gap-2">
                <Icon name="lucide:puzzle" class="w-4 h-4 text-muted-foreground" />
                <h4 class="font-semibold text-base">
                  Количество деталей
                </h4>
              </div>
              <div class="space-y-4 pt-2">
                <Skeleton class="h-4 w-full" />
                <Skeleton class="h-4 w-1/2" />
              </div>
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- Футер с кнопками -->
      <DrawerFooter>
        <Button
          v-if="activeFiltersCount > 0"
          variant="outline"
          class="w-full"
          @click="resetFilters"
        >
          <Icon name="lucide:x" class="w-4 h-4 mr-2" />
          Сбросить все фильтры
        </Button>
        <DrawerClose as-child>
          <Button class="w-full" @click="closeSheet">
            <Icon name="lucide:check" class="w-4 h-4 mr-2" />
            Показать результаты
          </Button>
        </DrawerClose>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
</template>
