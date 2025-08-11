<script setup lang="ts">
import type { EditableCategory } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import RecursiveMenuItemFormNode from '@/components/admin/categories/RecursiveMenuItemFormNode.vue'
import { Button } from '@/components/ui/button'
import { useAdminCategoriesStore } from '@/stores/adminCategories/useAdminCategoriesStore'

definePageMeta({ layout: 'admin' })

const adminCategoriesStore = useAdminCategoriesStore()

const rootCategories = computed(() => adminCategoriesStore.buildCategoryTree(null))
const selectedRootCategory = ref<EditableCategory | null>(null)
const formTree = ref<EditableCategory[]>([]) // ИСПРАВЛЕНИЕ №1: Это независимый ref
const isSaving = ref(false)

onMounted(() => {
  adminCategoriesStore.fetchAllCategories()
})

function selectRootCategory(category: EditableCategory) {
  selectedRootCategory.value = category
  // ИСПРАВЛЕНИЕ №1: Создаем глубокую копию для безопасного редактирования
  formTree.value = JSON.parse(JSON.stringify(category.children || []))
}

function handleAddChild(parentItem: EditableCategory) {
  if (!parentItem.children)
    parentItem.children = []
  const newChild: EditableCategory = {
    id: '',
    _tempId: uuidv4(),
    _isNew: true,
    name: '',
    slug: '',
    href: '',
    parent_id: parentItem.id,
    display_order: parentItem.children.length,
    children: [],
    description: null,
    is_root_category: false,
    display_in_menu: true,
    image_url: null,
    icon_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  parentItem.children.push(newChild)
}

function addNodeToRoot() {
  if (!selectedRootCategory.value)
    return
  const newChild: EditableCategory = {
    id: '',
    _tempId: uuidv4(),
    _isNew: true,
    name: '',
    slug: '',
    href: '',
    parent_id: selectedRootCategory.value.id,
    display_order: formTree.value.length,
    children: [],
    description: null,
    is_root_category: false,
    display_in_menu: true,
    image_url: null,
    icon_name: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  formTree.value.push(newChild)
}

function handleRemoveNode(itemToRemove: EditableCategory, tree: EditableCategory[]): boolean {
  const targetId = itemToRemove.id || itemToRemove._tempId
  const index = tree.findIndex(item => (item.id || item._tempId) === targetId)

  if (index !== -1) {
    const nodeToModify = tree[index]

    if (nodeToModify) {
      if (nodeToModify.id) {
        nodeToModify._isDeleted = true
      }
      else {
        tree.splice(index, 1)
      }
    }
    return true // Нашли и обработали
  }

  // Ищем в дочерних элементах (этот блок уже был правильным)
  for (const item of tree) {
    if (Array.isArray(item.children) && item.children.length > 0) {
      if (handleRemoveNode(itemToRemove, item.children)) {
        return true
      }
    }
  }

  return false
}

async function saveAllChanges() {
  if (!selectedRootCategory.value)
    return
  isSaving.value = true

  const finalTreeState = adminCategoriesStore.buildCategoryTree(null)
  const categoryToUpdate = finalTreeState.find(c => c.id === selectedRootCategory.value?.id)

  if (categoryToUpdate) {
    categoryToUpdate.children = formTree.value // Заменяем детей на отредактированную копию
  }
  else {
    toast.error('Критическая ошибка: не удалось найти корневую категорию.')
    isSaving.value = false
    return
  }

  const success = await adminCategoriesStore.saveChanges(finalTreeState)

  if (success) {
    await adminCategoriesStore.fetchAllCategories(true)
    const updatedRootCategory = adminCategoriesStore.allCategories.find(c => c.id === selectedRootCategory.value?.id)
    if (updatedRootCategory) {
      const fullTree = adminCategoriesStore.buildCategoryTree(null)
      const newlySelected = fullTree.find(c => c.id === updatedRootCategory.id) || null
      if (newlySelected)
        selectRootCategory(newlySelected)
    }
  }
  isSaving.value = false
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <!-- Шапка страницы -->
    <div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
      <h1 class="text-3xl font-bold text-foreground">
        Управление Категориями
      </h1>
      <Button v-if="selectedRootCategory" :disabled="isSaving" @click="saveAllChanges">
        <span v-if="isSaving">Сохранение...</span>
        <span v-else>Сохранить все изменения</span>
      </Button>
    </div>

    <!-- Индикаторы -->
    <div v-if="adminCategoriesStore.isLoading" class="text-center py-20">
      <p class="text-muted-foreground mt-4 text-lg">
        Загрузка данных...
      </p>
    </div>

    <!-- Основная сетка -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <aside class="lg:col-span-1">
        <h2 class="text-lg font-semibold mb-3">
          1. Выберите корневой раздел
        </h2>
        <div class="space-y-1">
          <Button
            v-for="rootCat in rootCategories"
            :key="rootCat.id"
            variant="ghost"
            class="w-full justify-start text-base h-auto py-2 text-left"
            :class="{ 'bg-accent text-accent-foreground font-semibold': selectedRootCategory?.id === rootCat.id }"
            @click="selectRootCategory(rootCat)"
          >
            <span class="flex-1">{{ rootCat.name }}</span>
          </Button>
        </div>
        <p class="text-xs text-muted-foreground mt-2 p-2 bg-muted/50 rounded-md">
          Корневые категории создаются в БД с флагом `is_root_category=true`.
        </p>
      </aside>

      <main class="lg:col-span-3">
        <div v-if="selectedRootCategory" class="bg-card p-6 rounded-lg shadow-md space-y-4">
          <h2 class="text-xl font-bold">
            Редактирование подкатегорий для: <span class="text-primary">{{ selectedRootCategory.name }}</span>
          </h2>

          <div v-if="!formTree.length" class="text-center py-5 border-dashed border-2 rounded-md">
            Нет подкатегорий. Нажмите кнопку ниже, чтобы добавить.
          </div>

          <div v-for="item in formTree" :key="item.id || item._tempId!">
            <RecursiveMenuItemFormNode
              :item="item"
              :level="0"
              :parent-href="selectedRootCategory.href || ''"
              @add-child="handleAddChild" @remove-self="handleRemoveNode(item, formTree)"
            />
          </div>

          <div class="pt-4 border-t">
            <Button variant="outline" class="w-full border-dashed" @click="addNodeToRoot">
              Добавить подкатегорию в "{{ selectedRootCategory.name }}"
            </Button>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 bg-card rounded-lg text-muted-foreground shadow-md">
          <p>Выберите раздел слева для редактирования.</p>
        </div>
      </main>
    </div>
  </div>
</template>
