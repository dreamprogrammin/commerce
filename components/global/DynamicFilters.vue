<script setup lang="ts">
import type { PropType } from 'vue'
import type { AttributeWithValue, IBreadcrumbItem } from '@/types' // Убедитесь, что типы импортированы
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

// --- 1. PROPS & EMITS ---
const props = defineProps({
  // modelValue теперь содержит все активные фильтры
  modelValue: {
    type: Object as PropType<{
      subCategoryIds: string[]
      price: [number, number]
      // `attributes` - это объект, где ключ - слаг атрибута (например, 'brand', 'color'),
      // а значение - массив ID выбранных опций
      attributes: Record<string, (string | number)[]>
    }>,
    required: true,
  },
  isLoading: { type: Boolean, default: false },
  priceRange: {
    type: Object as PropType<{ min: number, max: number }>,
    required: true,
  },
  // Принимаем наш новый динамический список фильтров
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

// Локальное состояние для слайдера цены, чтобы UI был отзывчивым
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

// УНИВЕРСАЛЬНАЯ функция для обновления ЛЮБОГО атрибута
function updateAttribute(checked: boolean, attributeSlug: string, optionId: string | number) {
  const currentSelection = props.modelValue.attributes[attributeSlug] || []
  const newSelection = new Set(currentSelection)

  if (checked) {
    newSelection.add(optionId)
  }
  else {
    newSelection.delete(optionId)
  }

  emit('update:modelValue', {
    ...props.modelValue,
    attributes: {
      ...props.modelValue.attributes,
      [attributeSlug]: Array.from(newSelection),
    },
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
  // При смене категории, сбрасываем и локальную цену
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

    <!-- 1. ФИЛЬТР ПО ПОДКАТЕГОРИЯМ (логика сохранена) -->
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

    <!-- 2. ДИНАМИЧЕСКИЕ ФИЛЬТРЫ (Атрибуты) -->
    <div
      v-for="filter in availableFilters"
      :key="filter.id"
      class="space-y-4 pt-4 border-t"
    >
      <h4 class="font-semibold">
        {{ filter.name }}
      </h4>

      <!-- Рендерим чекбоксы для типа 'select' -->
      <div v-if="filter.display_type === 'select'" class="space-y-2">
        <div
          v-for="option in filter.attribute_options"
          :key="option.id"
          class="flex items-center space-x-2"
        >
          <Checkbox
            :id="`attr-${option.id}`"
            :checked="modelValue.attributes[filter.slug]?.includes(option.id)"
            @update:checked="(checked) => updateAttribute(!!checked, filter.slug, option.id)"
          />
          <Label :for="`attr-${option.id}`" class="font-normal cursor-pointer">{{ option.value }}</Label>
        </div>
      </div>

      <!-- Рендерим кружки с цветом для типа 'color' -->
      <div v-if="filter.display_type === 'color'" class="flex flex-wrap gap-2">
        <button
          v-for="option in filter.attribute_options"
          :key="option.id"
          type="button"
          :title="option.value"
          :style="{ backgroundColor: option.meta?.hex }"
          class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
          :class="{
            'border-primary ring-2 ring-primary ring-offset-2': modelValue.attributes[filter.slug]?.includes(option.id),
            'border-border': !modelValue.attributes[filter.slug]?.includes(option.id),
          }"
          @click="() => updateAttribute(true, filter.slug, option.id)"
        />
        <!-- Примечание: для цветов лучше использовать не toggle, а просто выбор. Повторный клик не будет отменять. -->
        <!-- Если нужна отмена, логику `updateAttribute` нужно будет усложнить -->
      </div>

      <!-- TODO: Здесь можно добавить рендеринг для других типов, например, 'range' -->
    </div>

    <!-- 3. ФИЛЬТР ПО ЦЕНЕ (логика сохранена) -->
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
  </div>
</template>
