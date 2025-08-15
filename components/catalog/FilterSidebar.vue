<script setup lang="ts">
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'
import { useProductsStore } from '@/stores/publicStore/productsStore'

// `defineModel` - это наш главный инструмент для связи с родительской страницей.
const filters = defineModel<{
  subCategoryIds: string[]
  price: [number, number]
}>({ required: true })

// Инициализация сторов и получение данных
const route = useRoute()
const categoriesStore = useCategoriesStore()
const productsStore = useProductsStore()

const currentCategorySlug = computed(() => (route.params.slug as string[]).slice(-1)[0] ?? null)
const subcategories = computed(() => categoriesStore.getSubcategories(currentCategorySlug.value))
const priceRange = computed(() => productsStore.priceRange)

// Локальное состояние ТОЛЬКО для слайдера, чтобы UI был отзывчивым.
const localPrice = ref<[number, number]>([priceRange.value.min, priceRange.value.max])

// Функция, которая вызывается, когда пользователь ОТПУСКАЕТ ползунок.
// Она обновляет ГЛАВНЫЙ объект `filters`, что запускает перезагрузку товаров.
// Мы говорим функции, что она принимает `number[]` - то, что отдает Slider.
function commitPriceToFilters(newPrice: number[]) {
  // "Защита от дурака": проверяем, что в массиве действительно два элемента.
  if (Array.isArray(newPrice) && newPrice.length === 2) {
    // Если все хорошо, мы "утверждаем" (as), что это теперь
    // наш надежный кортеж `[number, number]`, и присваиваем его.
    filters.value.price = newPrice as [number, number]
  }
}

// Следим за изменением `priceRange` из стора (когда загружаются новые товары)
// и сбрасываем локальное состояние слайдера на полный диапазон.
watch(priceRange, (newRange) => {
  // Мы обновляем ТОЛЬКО локальное состояние слайдера.
  // Это не вызовет `watch` на родительской странице.
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
          :checked="filters.subCategoryIds.includes(cat.id)"
          @update:checked="(checked: boolean) => {
            if (checked) {
              filters.subCategoryIds.push(cat.id);
            }
            else {
              filters.subCategoryIds = filters.subCategoryIds.filter(id => id !== cat.id);
            }
          }"
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
