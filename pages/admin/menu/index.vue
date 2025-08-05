<script setup lang="ts">
import { toast } from 'vue-sonner';
import { v4 as uuidv4 } from 'uuid';
import { useAdminCategoriesStore } from '@/stores/adminCategories/useAdminCategoriesStore';
import type { EditableCategory } from '@/types';

definePageMeta({ layout: 'admin' });

const adminCategoriesStore = useAdminCategoriesStore();

const rootCategories = computed(() => adminCategoriesStore.buildCategoryTree(null));

const selectedRootCategory = ref<EditableCategory | null>(null);

const formTree = computed<EditableCategory[]>({
  get() {
    return selectedRootCategory.value?.children || [];
  },
  set(newValue) {
    if (selectedRootCategory.value) {
      selectedRootCategory.value.children = newValue;
    }
  }
});

const isSaving = ref(false);

onMounted(() => {
  adminCategoriesStore.fetchAllCategories();
});

function selectRootCategory(category: EditableCategory) {
  selectedRootCategory.value = category;
}

function handleAddChild(parentItem: EditableCategory) {
  if (!parentItem.children) {
    parentItem.children = [];
  }

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
    updated_at: new Date().toISOString()
  };

  parentItem.children.push(newChild);
}

function addNodeToRoot() {
  if (!selectedRootCategory.value) return;
  handleAddChild(selectedRootCategory.value);
}

async function saveAllChanges() {
  if (!selectedRootCategory.value) return;
  isSaving.value = true;

  const success = await adminCategoriesStore.saveChanges(rootCategories.value);

  if (success && selectedRootCategory.value) {
    const updatedRoot = adminCategoriesStore.allCategories.find(c => c.id === selectedRootCategory.value?.id);
    if (updatedRoot) {
      const fullTree = adminCategoriesStore.buildCategoryTree(null);
      selectedRootCategory.value = fullTree.find(c => c.id === updatedRoot.id) || null;
    }
  }

  isSaving.value = false;
}
</script>

<template>
  <div class="container mx-auto p-4 md:p-8">
    <div class="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-6">
      <h1 class="text-3xl font-bold text-foreground">Управление Категориями</h1>
      <Button v-if="selectedRootCategory" @click="saveAllChanges" :disabled="isSaving">
        Сохранить все изменения
      </Button>
    </div>

    <div v-if="adminCategoriesStore.isLoading" class="text-center py-20">
      <p class="text-muted-foreground mt-4 text-lg">Загрузка данных...</p>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-4 gap-8">
      <!-- Левая колонка: выбор корневой категории -->
      <aside class="lg:col-span-1">
        <h2 class="text-lg font-semibold mb-3">1. Выберите корневой раздел</h2>
        <div class="space-y-1">
          <!-- Вместо staticMainMenuItems, мы итерируем rootCategories из стора -->
          <Button
            v-for="rootCat in rootCategories"
            :key="rootCat.id"
            @click="selectRootCategory(rootCat)"
            variant="ghost"
            class="w-full justify-start text-base h-auto py-2 text-left"
            :class="{ 'bg-accent text-accent-foreground font-semibold': selectedRootCategory?.id === rootCat.id }"
          >
            <span class="flex-1">{{ rootCat.name }}</span>
          </Button>
        </div>
        <p class="text-xs text-muted-foreground mt-2">
          Корневые категории создаются в базе данных с флагом `is_root_category = true`.
        </p>
      </aside>

      <!-- Правая колонка: форма с редактором -->
      <main class="lg:col-span-3">
        <div v-if="selectedRootCategory" class="bg-card p-6 rounded-lg shadow-md space-y-4">
          <h2 class="text-xl font-bold">
            Редактирование подкатегорий для:
            <span class="text-primary">{{ selectedRootCategory.name }}</span>
          </h2>

          <div v-if="formTree.length === 0" class="text-center py-5 border-dashed border-2 rounded-md">
            Нет подкатегорий. Нажмите кнопку ниже, чтобы добавить.
          </div>

          <div v-for="(item, index) in formTree" :key="item.id || item._tempId!">
            <RecursiveCategoryFormNode
              :item="item"
              :level="0"
              :parent-href="selectedRootCategory.href || ''"
              @add-child="handleAddChild"
              @remove-self="item._isDeleted = true"
            />
          </div>

          <div class="pt-4 border-t">
            <Button @click="addNodeToRoot" variant="outline" class="w-full border-dashed">
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

<!-- Стили для "удаленных" элементов -->
<style scoped>
.item-deleted {
  opacity: 0.5;
  border-color: red;
  pointer-events: none;
}
</style>
