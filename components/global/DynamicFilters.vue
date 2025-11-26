<script setup lang="ts">
import type { PropType } from 'vue'
import type { AttributeWithValue, BrandForFilter, ColorOptionMeta, Country, Material } from '@/types'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

// --- 1. PROPS & EMITS ---
const props = defineProps({
  modelValue: {
    type: Object as PropType<{
      subCategoryIds: string[]
      price: [number, number]
      brandIds: string[]
      materialIds: string[]
      countryIds: string[]
      attributes: Record<string, (string | number)[]>
    }>,
    required: true,
  },
  isLoading: { type: Boolean, default: false },
  priceRange: {
    type: Object as PropType<{ min: number, max: number }>,
    required: true,
  },
  availableBrands: {
    type: Array as PropType<BrandForFilter[]>,
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
})

const emit = defineEmits(['update:modelValue'])

// --- 2. ЛОКАЛЬНОЕ СОСТОЯНИЕ И COMPUTEDS ---
const categoriesStore = useCategoriesStore()
const route = useRoute()

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))

const localPrice = ref<[number, number]>([...props.modelValue.price])

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

function updateDirectFilter(checked: boolean, key: 'brandIds' | 'materialIds' | 'countryIds', id: string | number) {
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

// Синхронизируем локальную цену с пропсами
watch(() => props.modelValue.price, (newVal) => {
  localPrice.value = [...newVal]
}, { deep: true })

watch(() => props.priceRange, (newRange) => {
  localPrice.value = [newRange.min, newRange.max]
}, { deep: true })
</script>

<template>
  <div class="p-4 border rounded-lg bg-card space-y-6">
    <div>
      <h3 class="font-semibold text-lg">
        Фильтры
      </h3>
    </div>

    <!-- 1. ФИЛЬТР ПО ПОДКАТЕГОРИЯМ -->
    <div v-if="subcategories.length > 0" class="space-y-4">
      <h4 class="font-semibold">
        Подкатегории
      </h4>
      <div v-for="cat in subcategories" :key="cat.id" class="flex items-center space-x-2">
        <Checkbox
          :id="`cat-${cat.id}`"
          :checked="props.modelValue.subCategoryIds.includes(cat.id)"
          @update:model-value="(checked) => updateSubCategory(!!checked, cat.id)"
        />
        <Label :for="`cat-${cat.id}`" class="font-normal cursor-pointer">{{ cat.name }}</Label>
      </div>
    </div>

    <!-- 2. БРЕНДЫ -->
    <div v-if="availableBrands.length > 0" class="space-y-4 pt-4 border-t">
      <h4 class="font-semibold">
        Бренды
      </h4>
      <div class="space-y-2">
        <div v-for="brand in availableBrands" :key="brand.id" class="flex items-center space-x-2">
          <Checkbox
            :id="`brand-${brand.id}`"
            :checked="modelValue.brandIds?.includes(brand.id)"
            @update:model-value="(checkedState) => updateDirectFilter(!!checkedState, 'brandIds', brand.id)"
          />
          <Label :for="`brand-${brand.id}`" class="font-normal cursor-pointer">{{ brand.name }}</Label>
        </div>
      </div>
    </div>

    <!-- 3. МАТЕРИАЛЫ -->
    <div v-if="availableMaterials.length > 0" class="space-y-4 pt-4 border-t">
      <h4 class="font-semibold">
        Материал
      </h4>
      <div class="space-y-2">
        <div v-for="material in availableMaterials" :key="material.id" class="flex items-center space-x-2">
          <Checkbox
            :id="`material-${material.id}`"
            :checked="modelValue.materialIds?.includes(String(material.id))"
            @update:model-value="(checkedState) => updateDirectFilter(!!checkedState, 'materialIds', material.id)"
          />
          <Label :for="`material-${material.id}`" class="font-normal cursor-pointer">{{ material.name }}</Label>
        </div>
      </div>
    </div>

    <!-- 4. СТРАНЫ -->
    <div v-if="availableCountries.length > 0" class="space-y-4 pt-4 border-t">
      <h4 class="font-semibold">
        Страна происхождения
      </h4>
      <div class="space-y-2">
        <div v-for="country in availableCountries" :key="country.id" class="flex items-center space-x-2">
          <Checkbox
            :id="`country-${country.id}`"
            :checked="modelValue.countryIds?.includes(String(country.id))"
            @update:model-value="(checkedState) => updateDirectFilter(!!checkedState, 'countryIds', country.id)"
          />
          <Label :for="`country-${country.id}`" class="font-normal cursor-pointer">{{ country.name }}</Label>
        </div>
      </div>
    </div>

    <!-- 5. ДИНАМИЧЕСКИЕ АТРИБУТЫ -->
    <div
      v-for="filter in availableFilters"
      :key="filter.id"
      class="space-y-4 pt-4 border-t"
    >
      <h4 class="font-semibold">
        {{ filter.name }}
      </h4>

      <!-- Для типа 'select' -->
      <div v-if="filter.display_type === 'select'" class="space-y-2">
        <div
          v-for="option in filter.attribute_options"
          :key="option.id"
          class="flex items-center space-x-2"
        >
          <Checkbox
            :id="`attr-${option.id}`"
            :checked="modelValue.attributes[filter.slug]?.includes(option.id)"
            @update:model-value="(checked) => updateAttribute(!!checked, filter.slug, option.id)"
          />
          <Label :for="`attr-${option.id}`" class="font-normal cursor-pointer">{{ option.value }}</Label>
        </div>
      </div>

      <!-- Для типа 'color' -->
      <div v-if="filter.display_type === 'color'" class="flex flex-wrap gap-2">
        <button
          v-for="option in filter.attribute_options"
          :key="option.id"
          type="button"
          :title="option.value"
          :style="{ backgroundColor: ((option.meta as unknown) as ColorOptionMeta)?.hex }"
          class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
          :class="{
            'border-primary ring-2 ring-primary ring-offset-2': modelValue.attributes[filter.slug]?.includes(option.id),
            'border-border': !modelValue.attributes[filter.slug]?.includes(option.id),
          }"
          @click="() => {
            const isCurrentlyChecked = modelValue.attributes[filter.slug]?.includes(option.id);
            updateAttribute(!isCurrentlyChecked, filter.slug, option.id);
          }"
        />
      </div>
    </div>

    <!-- 6. ФИЛЬТР ПО ЦЕНЕ -->
    <ClientOnly>
      <div class="space-y-4 pt-4 border-t">
        <h4 class="font-semibold">
          Цена
        </h4>
        <div v-if="isLoading" class="space-y-4 pt-2">
          <Skeleton class="h-4 w-full" />
          <Skeleton class="h-4 w-1/2" />
        </div>
        <template v-else>
          <Slider
            v-model="localPrice"
            :min="priceRange.min"
            :max="priceRange.max"
            :step="100"
            @value-commit="commitPriceToFilters"
          />
          <div class="flex justify-between text-sm text-muted-foreground">
            <span>{{ Math.round(localPrice[0]) }} ₸</span>
            <span>{{ Math.round(localPrice[1]) }} ₸</span>
          </div>
        </template>
      </div>

      <!-- Fallback для SSR -->
      <template #fallback>
        <div class="space-y-4 pt-4 border-t">
          <h4 class="font-semibold">
            Цена
          </h4>
          <div class="space-y-4 pt-2">
            <Skeleton class="h-4 w-full" />
            <Skeleton class="h-4 w-1/2" />
          </div>
        </div>
      </template>
    </ClientOnly>
  </div>
</template>
