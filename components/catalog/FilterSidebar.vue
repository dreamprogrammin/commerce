<script setup lang="ts">
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

const filters = defineModel<{
  subCategoryIds: string[]
  price: [number, number]
}>({ required: true })

const route = useRoute()
const categoriesStore = useCategoriesStore()
const productsStore = useProductsStore()

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)

const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))
const priceRange = computed(() => productsStore.priceRange)

// Локальное состояние для слайдера, чтобы не вызывать запросы на каждое движение.
const priceValue = ref([priceRange.value.min, priceRange.value.max])

// Функция вызывается, когда пользователь ОТПУСКАЕТ ползунок.
function updatePriceFilterOnCommit(newPriceValue: [number, number]) {
  filters.value.price = newPriceValue
}

// Следим за изменением `priceRange` из стора, чтобы обновить наш слайдер.
watch(priceRange, (newRange) => {
  priceValue.value = [newRange.min, newRange.max]
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
          v-model="filters.subCategoryIds"
          :value="cat.id"
        />
        <Label :for="`cat-${cat.id}`" class="font-normal cursor-pointer">{{ cat.name }}</Label>
      </div>
    </div>

    <!-- Фильтр по цене -->
    <div class="space-y-4 pt-4 border-t">
      <h4 class="font-semibold">
        Цена
      </h4>
      <div v-if="productsStore.isLoading" class="space-y-4 pt-2">
        <Skeleton class="h-4 w-full" />
        <Skeleton class="h-4 w-1/2" />
      </div>
      <template v-else>
        <!--
          `v-model:model-value` для мгновенного обновления локального `priceValue`.
          `@value-commit` - специальное событие от компонента Slider,
          срабатывает, когда пользователь отпустил ползунок.
        -->
        <Slider
          :model-value="priceValue"
          :min="priceRange.min"
          :max="priceRange.max"
          :step="100"
          @update:model-value="val => priceValue = val"
          @value-commit="updatePriceFilterOnCommit"
        />
        <div class="flex justify-between text-sm text-muted-foreground">
          <span>{{ Math.round(priceValue[0]) }} ₸</span>
          <span>{{ Math.round(priceValue[1]) }} ₸</span>
        </div>
      </template>
    </div>
  </div>
</template>
