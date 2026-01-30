<script setup lang="ts">
import type { EditableCategory } from '@/types'
import { v4 as uuidv4 } from 'uuid'
import { computed, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import RecursiveMenuItemFormNode from '@/components/admin/categories/RecursiveMenuItemFormNode.vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useAdminCategoriesStore } from '@/stores/adminStore/adminCategoriesStore'

definePageMeta({ layout: 'admin' })

const adminCategoriesStore = useAdminCategoriesStore()

const rootCategories = computed(() => adminCategoriesStore.buildCategoryTree(null))
const selectedRootCategory = ref<EditableCategory | null>(null)
const formTree = reactive<EditableCategory[]>([])
const isSaving = ref(false)

onMounted(() => {
  adminCategoriesStore.fetchAllCategories()
})

function handleAddChild(parentItem: EditableCategory) {
  function findAndAdd(tree: EditableCategory[]): boolean {
    const parentId = parentItem.id || parentItem._tempId
    const parentNode = tree.find(item => (item.id || item._tempId) === parentId)

    if (parentNode) {
      if (!parentNode.children) {
        parentNode.children = []
      }

      const newChild: EditableCategory = {
        id: '',
        _tempId: uuidv4(),
        _isNew: true,
        name: '',
        slug: '',
        href: '',
        parent_id: parentNode.id,
        display_order: parentNode.children.length,
        children: [],
        description: null,
        is_root_category: false,
        display_in_menu: true,
        image_url: null,
        icon_name: null,
        is_featured: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      parentNode.children.push(newChild)
      return true
    }

    for (const item of tree) {
      if (Array.isArray(item.children) && findAndAdd(item.children)) {
        return true
      }
    }
    return false
  }

  findAndAdd(formTree)
}

function selectRootCategory(category: EditableCategory) {
  selectedRootCategory.value = category
  formTree.length = 0
  const newChildren = JSON.parse(JSON.stringify(category.children || []))
  formTree.push(...newChildren)
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
    display_order: formTree.length,
    children: [],
    description: null,
    is_root_category: false,
    display_in_menu: true,
    image_url: null,
    icon_name: null,
    is_featured: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  formTree.push(newChild)
}

async function saveAllChanges() {
  if (!selectedRootCategory.value)
    return

  console.log('💾 НАЧИНАЕМ СОХРАНЕНИЕ') // 🔍 ЛОГ

  // 🔍 Логируем состояние перед сохранением
  function logTreeState(tree: EditableCategory[], prefix = '') {
    tree.forEach((item) => {
      console.log(`${prefix}📁 ${item.name}:`, {
        hasFile: !!item._imageFile,
        hasPreview: !!item._imagePreview,
        hasBlur: !!item._blurPlaceholder,
        blurLength: item._blurPlaceholder?.length,
        blurPreview: item._blurPlaceholder?.substring(0, 50),
      })
      if (item.children?.length) {
        logTreeState(item.children, `${prefix}  `)
      }
    })
  }

  console.log('🌳 Состояние дерева перед сохранением:')
  logTreeState(formTree)

  isSaving.value = true

  const finalTreeState = adminCategoriesStore.buildCategoryTree(null)
  const categoryToUpdate = finalTreeState.find(c => c.id === selectedRootCategory.value?.id)

  if (categoryToUpdate) {
    categoryToUpdate.children = toRaw(formTree)

    // 🆕 Обновляем SEO поля корневой категории
    categoryToUpdate.meta_title = selectedRootCategory.value.meta_title
    categoryToUpdate.meta_description = selectedRootCategory.value.meta_description
    categoryToUpdate.meta_keywords = selectedRootCategory.value.meta_keywords
  }
  else {
    toast.error('Критическая ошибка: не удалось найти корневую категорию.')
    isSaving.value = false
    return
  }

  const success = await adminCategoriesStore.saveChanges(finalTreeState)

  if (success) {
    await adminCategoriesStore.fetchAllCategories(true)
    const updatedFullTree = adminCategoriesStore.buildCategoryTree(null)
    const newlySelected = updatedFullTree.find(c => c.id === selectedRootCategory.value?.id) || null
    if (newlySelected) {
      selectRootCategory(newlySelected)
    }
    else {
      selectedRootCategory.value = null
      formTree.length = 0
    }
  }
  isSaving.value = false
}

function handleRemove(itemToRemove: EditableCategory) {
  function findAndRemove(tree: EditableCategory[]): boolean {
    const targetId = itemToRemove.id || itemToRemove._tempId
    const index = tree.findIndex(item => (item.id || item._tempId) === targetId)

    if (index !== -1) {
      const nodeToRemove = tree[index]

      if (nodeToRemove) {
        if (nodeToRemove.id) {
          nodeToRemove._isDeleted = true
        }
        else {
          tree.splice(index, 1)
        }
      }
      return true
    }

    for (const item of tree) {
      if (Array.isArray(item.children) && findAndRemove(item.children)) {
        return true
      }
    }

    return false
  }

  findAndRemove(formTree)
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
      <h1 class="text-3xl font-bold text-foreground">
        Управление Категориями
      </h1>
      <Button v-if="selectedRootCategory" :disabled="isSaving" @click="saveAllChanges">
        <span v-if="isSaving">Сохранение...</span>
        <span v-else>Сохранить все изменения</span>
      </Button>
    </div>

    <div v-if="adminCategoriesStore.isLoading" class="text-center py-20">
      <p class="text-muted-foreground mt-4 text-lg">
        Загрузка данных...
      </p>
    </div>

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
      </aside>

      <main class="lg:col-span-3">
        <div v-if="selectedRootCategory" class="space-y-6">
          <!-- SEO ПОЛЯ КОРНЕВОЙ КАТЕГОРИИ -->
          <div class="bg-card p-6 rounded-lg shadow-md space-y-4">
            <h2 class="text-xl font-bold flex items-center gap-2">
              <Icon name="lucide:search" class="w-5 h-5 text-primary" />
              SEO настройки: <span class="text-primary">{{ selectedRootCategory.name }}</span>
            </h2>
            <p class="text-sm text-muted-foreground">
              Эти meta-теги используются поисковыми системами для индексации страницы категории
            </p>

            <div class="space-y-4">
              <div class="space-y-2">
                <label class="text-sm font-medium">Meta Title (заголовок для поисковых систем)</label>
                <Input
                  v-model="selectedRootCategory.meta_title"
                  placeholder="Например: Купить игрушки в Алматы | Uhti.kz"
                  class="w-full"
                  maxlength="60"
                />
                <p class="text-xs text-muted-foreground">
                  Рекомендуемая длина: до 60 символов. Текущая длина: {{ selectedRootCategory.meta_title?.length || 0 }}
                </p>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium">Meta Description (описание для поисковых систем)</label>
                <Textarea
                  v-model="selectedRootCategory.meta_description"
                  placeholder="Например: Широкий выбор качественных игрушек для детей всех возрастов. Доставка по Алматы. Низкие цены и бонусная программа."
                  class="w-full min-h-[80px]"
                  maxlength="160"
                />
                <p class="text-xs text-muted-foreground">
                  Рекомендуемая длина: до 160 символов. Текущая длина: {{ selectedRootCategory.meta_description?.length || 0 }}
                </p>
              </div>

              <div class="space-y-2">
                <label class="text-sm font-medium">Meta Keywords (ключевые слова, через запятую)</label>
                <Input
                  v-model="selectedRootCategory.meta_keywords"
                  placeholder="Например: игрушки, детские товары, игры, развивающие игрушки"
                  class="w-full"
                />
                <p class="text-xs text-muted-foreground">
                  Ключевые слова через запятую. Рекомендуется 5-10 слов.
                </p>
              </div>
            </div>
          </div>

          <!-- ПОДКАТЕГОРИИ -->
          <div class="bg-card p-6 rounded-lg shadow-md space-y-4">
            <h2 class="text-xl font-bold">
              Редактирование подкатегорий для: <span class="text-primary">{{ selectedRootCategory.name }}</span>
            </h2>

            <div v-if="!formTree.length" class="text-center py-5 border-dashed border-2 rounded-md">
              Нет подкатегорий. Нажмите кнопку ниже, чтобы добавить.
            </div>

          <div v-for="(item, index) in formTree" :key="item.id || item._tempId!">
            <RecursiveMenuItemFormNode
              :item="item"
              :level="0"
              :parent-href="selectedRootCategory.href || ''"
              @remove-self="handleRemove(item)"
              @update:item="(updateItem) => {
                console.log('🔄 update:item получен:', {
                  name: updateItem.name,
                  hasBlur: !!updateItem._blurPlaceholder,
                  blurLength: updateItem._blurPlaceholder?.length,
                })
                formTree[index] = updateItem
              }"
              @remove-child="handleRemove"
              @add-child="handleAddChild"
            />
          </div>

          <div class="pt-4 border-t">
            <Button variant="outline" class="w-full border-dashed" @click="addNodeToRoot">
              Добавить подкатегорию в "{{ selectedRootCategory.name }}"
            </Button>
          </div>
          </div>
        </div>
        <div v-else class="flex items-center justify-center h-64 bg-card rounded-lg text-muted-foreground shadow-md">
          <p>Выберите раздел слева для редактирования.</p>
        </div>
      </main>
    </div>
  </div>
</template>
