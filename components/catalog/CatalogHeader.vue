<script setup lang="ts">
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

const props = defineProps<{
  categorySlug: string | null
}>()
const sortBy = defineModel<string>('sortBy', { required: true })
const categoriesStore = useCategoriesStore()

const pageTitle = computed(() => {
  // Используем наш getter для поиска имени категории по слагу
  const categoryInfo = categoriesStore.getBreadcrumbs(props.categorySlug)?.pop()
  return categoryInfo?.name || props.categorySlug?.replace(/-/g, ' ') || 'Каталог'
})
</script>

<template>
  <div class="flex flex-col sm:flex-row justify-between sm:items-center gap-4 mb-6">
    <h1 class="text-3xl font-bold capitalize">
      {{ pageTitle }}
    </h1>
    <div>
      <Select v-model="sortBy">
        <SelectTrigger class="w-[220px]">
          <SelectValue placeholder="Сортировка" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="popularity">
            Популярные
          </SelectItem>
          <SelectItem value="newest">
            По новизне
          </SelectItem>
          <SelectItem value="price_asc">
            Цена: по возрастанию
          </SelectItem>
          <SelectItem value="price_desc">
            Цена: по убыванию
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
