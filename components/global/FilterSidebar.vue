<script setup lang="ts">
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

const props = defineProps<{
  modelValue: {
    subCategoryIds: string[]
    price: [number, number] | undefined
    sortBy: string
  }
  isLoading: boolean
  priceRange: { min: number, max: number }
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: typeof props.modelValue): void
}>()

const route = useRoute()
const categoriesStore = useCategoriesStore()

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))

// Локальное состояние ТОЛЬКО для слайдера, чтобы UI был отзывчивым.
const localPrice = ref<[number, number]>(props.modelValue.price || [props.priceRange.min, props.priceRange.max])

function updateSubCategory(checked: boolean, catId: string) {
  const newIds = [...props.modelValue.subCategoryIds]
  if (checked) {
    newIds.push(catId)
  }
  else {
    const index = newIds.indexOf(catId)
    if (index > -1)
      newIds.splice(index, 1)
  }
  emit('update:modelValue', { ...props.modelValue, subCategoryIds: newIds })
}

function commitPriceToFilters(newPrice: number[]) {
  if (Array.isArray(newPrice) && newPrice.length === 2) {
    emit('update:modelValue', { ...props.modelValue, price: newPrice as [number, number] })
  }
}

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

    <!-- Фильтр по подкатегориям -->
    <div v-if="subcategories.length > 0" class="space-y-4">
      <h4 class="font-semibold">
        Подкатегории
      </h4>
      <div v-for="cat in subcategories" :key="cat.id" class="flex items-center space-x-2">
        <Checkbox
          :id="`cat-${cat.id}`"
          :checked="props.modelValue.subCategoryIds.includes(cat.id)"
          @update:checked="(checked: boolean) => updateSubCategory(checked, cat.id)"
        />
        <Label :for="`cat-${cat.id}`" class="font-normal cursor-pointer">{{ cat.name }}</Label>
      </div>
    </div>

    <!-- Фильтр по цене -->
    <div class="space-y-4 pt-4 border-t">
      <h4 class="font-semibold">
        Цена
      </h4>
      <div v-if="isLoading" class="space-y-4 pt-2">
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-1/2" />
      </div>
      <template v-else>
        <!--
          ИСПРАВЛЕНО: v-model теперь привязан к `localPrice`.
          Это синтаксический сахар для `:model-value` и `@update:model-value`.
        -->
        <Slider
          v-model="localPrice"
          :min="priceRange.min"
          :max="priceRange.max"
          :step="100"
          @value-commit="commitPriceToFilters"
        />
        <div class="flex justify-between text-sm text-muted-foreground">
          <!-- ИСПРАВЛЕНО: Отображаем `localPrice`, а не `priceValue` -->
          <span>{{ Math.round(localPrice[0]) }} ₸</span>
          <span>{{ Math.round(localPrice[1]) }} ₸</span>
        </div>
      </template>
    </div>
  </div>
</template>
