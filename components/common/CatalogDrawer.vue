<script setup lang="ts">
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { useCategoriesStore } from '@/stores/publicStore/categoriesStore'

const modelValue = defineModel<boolean>({ default: false })

const categoriesStore = useCategoriesStore()
const menuTree = computed(() => categoriesStore.menuTree)

const expandedL1 = ref<string | null>(null)
const expandedL2 = ref<Set<string>>(new Set())

function toggleL1(id: string) {
  expandedL1.value = expandedL1.value === id ? null : id
  expandedL2.value.clear()
}

function toggleL2(id: string) {
  if (expandedL2.value.has(id)) {
    expandedL2.value.delete(id)
  }
  else {
    expandedL2.value.add(id)
  }
}

function hasL3(child: typeof menuTree.value[0]) {
  return (child.children && child.children.length > 0) || (child.brands && child.brands.length > 0)
}

// Загружаем бренды при открытии drawer
watch(modelValue, (isOpen) => {
  if (isOpen) {
    categoriesStore.loadBrandsForMenuCategories()
  }
})

function closeDrawer() {
  modelValue.value = false
}
</script>

<template>
  <Sheet v-model:open="modelValue">
    <SheetContent side="left" class="w-[320px] p-0 flex flex-col">
      <SheetHeader class="p-4 border-b border-gray-100">
        <SheetTitle class="text-lg font-bold">
          Каталог
        </SheetTitle>
      </SheetHeader>

      <div class="flex-1 overflow-y-auto">
        <ul class="list-none py-2">
          <li v-for="rootItem in menuTree" :key="rootItem.id">
            <!-- L1: Корневые категории -->
            <button
              class="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50 transition-colors"
              @click="toggleL1(rootItem.id)"
            >
              <span>{{ rootItem.name }}</span>
              <Icon
                name="lucide:chevron-down"
                class="w-4 h-4 text-gray-400 transition-transform duration-200"
                :class="{ 'rotate-180': expandedL1 === rootItem.id }"
              />
            </button>

            <!-- L2: Дочерние категории -->
            <ul
              v-if="expandedL1 === rootItem.id && rootItem.children && rootItem.children.length > 0"
              class="list-none bg-gray-50"
            >
              <li v-for="childItem in rootItem.children" :key="childItem.id">
                <div class="flex items-center">
                  <NuxtLink
                    :to="childItem.href"
                    class="flex-1 px-6 py-2.5 text-sm text-gray-700 hover:text-blue-600 font-medium transition-colors"
                    @click="closeDrawer"
                  >
                    {{ childItem.name }}
                  </NuxtLink>
                  <button
                    v-if="hasL3(childItem)"
                    class="px-3 py-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                    @click="toggleL2(childItem.id)"
                  >
                    <Icon
                      name="lucide:chevron-down"
                      class="w-3.5 h-3.5 transition-transform duration-200"
                      :class="{ 'rotate-180': expandedL2.has(childItem.id) }"
                    />
                  </button>
                </div>

                <!-- L3: Подкатегории + Бренды -->
                <ul
                  v-if="expandedL2.has(childItem.id)"
                  class="list-none bg-white"
                >
                  <!-- Подкатегории -->
                  <li v-for="grandChild in childItem.children" :key="grandChild.id">
                    <NuxtLink
                      :to="grandChild.href"
                      class="flex items-center gap-2 px-8 py-2 text-xs text-gray-600 hover:text-blue-600 font-medium transition-colors"
                      @click="closeDrawer"
                    >
                      <Icon name="lucide:chevron-right" class="w-3 h-3" />
                      {{ grandChild.name }}
                    </NuxtLink>
                  </li>

                  <!-- Разделитель -->
                  <li
                    v-if="childItem.children && childItem.children.length > 0 && childItem.brands && childItem.brands.length > 0"
                    class="mx-8 my-1 border-t border-gray-100"
                  />

                  <!-- Бренды -->
                  <li v-for="brand in childItem.brands" :key="brand.id">
                    <NuxtLink
                      :to="`${childItem.href}?brand=${brand.slug}`"
                      class="flex items-center gap-2 px-8 py-2 text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                      @click="closeDrawer"
                    >
                      <Icon name="lucide:tag" class="w-3 h-3" />
                      {{ childItem.name }} {{ brand.name }}
                    </NuxtLink>
                  </li>

                  <!-- Skeleton при загрузке -->
                  <li v-if="categoriesStore.brandsLoading && !childItem.brandsLoaded" class="px-8 py-2 space-y-2">
                    <div v-for="n in 3" :key="n" class="h-3 w-28 bg-gray-200 rounded animate-pulse" />
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </div>

      <!-- Футер -->
      <div class="border-t border-gray-100 p-4">
        <NuxtLink
          to="/catalog"
          class="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors"
          @click="closeDrawer"
        >
          <Icon name="lucide:layout-grid" class="w-4 h-4" />
          Все категории
        </NuxtLink>
      </div>
    </SheetContent>
  </Sheet>
</template>
